import * as fs from 'fs';
import * as path from 'path';
import { createLogger, serializeMeta, formatLine } from './logger';

// 用工作区内的临时目录，而不是 os.tmpdir()：在部分沙箱环境里 os.tmpdir() 会被重定向到
// 跨盘符路径（如 D:\Software\Temp），配合 safe-delete 拦截器会导致 rmSync 直接崩溃。
// 固定落在仓库内（pre-commit / CI / 本地均在同一盘符），消除环境相关性。
const TMP_BASE = path.join(__dirname, '..', '..', '.tmp', 'log-test');

describe('serializeMeta', () => {
  it('passes through null / undefined', () => {
    expect(serializeMeta(null)).toBeNull();
    expect(serializeMeta(undefined)).toBeUndefined();
  });

  it('passes through primitives', () => {
    expect(serializeMeta('hi')).toBe('hi');
    expect(serializeMeta(42)).toBe(42);
    expect(serializeMeta(true)).toBe(true);
  });

  it('converts an Error to a plain object', () => {
    const s = serializeMeta(new Error('boom')) as Record<string, unknown>;
    expect(s.name).toBe('Error');
    expect(s.message).toBe('boom');
    expect(typeof s.stack).toBe('string');
  });

  it('serializes an Error cause', () => {
    const cause = new Error('root');
    const e = new Error('boom');
    (e as unknown as { cause: Error }).cause = cause;
    const s = serializeMeta(e) as Record<string, unknown>;
    expect((s.cause as Record<string, unknown>).message).toBe('root');
  });

  it('serializes arrays and nested objects', () => {
    const s = serializeMeta({ a: 1, b: [2, 3], c: { d: 4 } }) as Record<
      string,
      unknown
    >;
    expect(s).toEqual({ a: 1, b: [2, 3], c: { d: 4 } });
  });

  it('breaks circular references', () => {
    const obj: Record<string, unknown> = { name: 'x' };
    obj.self = obj;
    const s = serializeMeta(obj) as Record<string, unknown>;
    expect(s.name).toBe('x');
    expect(s.self).toBe('[circular]');
  });
});

describe('formatLine', () => {
  it('omits meta when empty', () => {
    expect(formatLine('T', 'info', 'hello', '')).toBe('[T] [INFO] hello');
  });

  it('appends meta when present', () => {
    expect(formatLine('T', 'error', 'oops', '{"a":1}')).toBe(
      '[T] [ERROR] oops {"a":1}',
    );
  });
});

describe('createLogger', () => {
  let dir: string;
  beforeEach(() => {
    fs.mkdirSync(TMP_BASE, { recursive: true });
    dir = fs.mkdtempSync(path.join(TMP_BASE, 'case-'));
  });
  // 日志写入是异步的（ensureDir Promise 链 + appendFile），每次写完才关闭句柄。
  // Windows 下若句柄仍打开，删除会被 EPERM 阻塞；目录非空则 ENOTEMPTY。
  // 改为 async + 重试：短暂等待 appendFile 完成并释放句柄后再删，消除竞态。
  afterEach(async () => {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        return;
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') return; // 已删除
        if (code === 'EPERM' || code === 'ENOTEMPTY') {
          await new Promise((r) => setTimeout(r, 50)); // 句柄未释放 → 等一会儿重试
          continue;
        }
        throw e;
      }
    }
    // 兜底：超过重试窗口仍失败则忽略（清理失败不应影响测试结论）
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  // 日志文件写入是异步的（ensureDir 的 Promise 链 + appendFile）。在并行测试负载下
  // 固定 50ms 等待偶发不足 → files.length 为 0。改为轮询直到文件出现（≤1s），消除竞态。
  const waitForFile = async (): Promise<void> => {
    const end = Date.now() + 1000;
    while (Date.now() < end) {
      try {
        if (fs.readdirSync(dir).length >= 1) return;
      } catch {
        /* 目录尚未创建 → 忽略，继续轮询 */
      }
      await new Promise((r) => setTimeout(r, 20));
    }
  };

  const waitForSpy = async (spy: jest.SpyInstance): Promise<void> => {
    const end = Date.now() + 1000;
    while (Date.now() < end) {
      if (spy.mock.calls.length > 0) return;
      await new Promise((r) => setTimeout(r, 20));
    }
  };

  it('writes a dated log file with level + message + meta', async () => {
    const log = createLogger({ logDir: dir, mirror: false });
    log.info('hello');
    log.warn('careful');
    log.error('bad', { code: 1 });
    await waitForFile();
    const files = fs.readdirSync(dir);
    expect(files.length).toBe(1);
    const content = fs.readFileSync(path.join(dir, files[0]), 'utf8');
    expect(content).toContain('[INFO] hello');
    expect(content).toContain('[WARN] careful');
    expect(content).toContain('[ERROR] bad');
    expect(content).toContain('"code":1');
  });

  it('omits meta from the line when none is provided', async () => {
    const log = createLogger({ logDir: dir, mirror: false });
    log.info('no-meta');
    await waitForFile();
    const files = fs.readdirSync(dir);
    const content = fs.readFileSync(path.join(dir, files[0]), 'utf8');
    expect(content).toContain('[INFO] no-meta');
    expect(content).not.toContain('{}');
  });

  it('respects minLevel (skips lower levels, writes the rest)', async () => {
    const log = createLogger({ logDir: dir, mirror: false, minLevel: 'error' });
    log.debug('ignored');
    log.error('kept');
    await waitForFile();
    const files = fs.readdirSync(dir);
    const content = files.length
      ? fs.readFileSync(path.join(dir, files[0]), 'utf8')
      : '';
    expect(content).not.toContain('ignored');
    expect(content).toContain('kept');
  });

  it('mirrors to console at the matching level', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const log = createLogger({ logDir: dir, mirror: true });
    log.error('mirrored');
    await waitForSpy(spy);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not crash when the log dir is invalid (best-effort)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const fileAsDir = path.join(dir, 'not-a-dir');
    fs.writeFileSync(fileAsDir, 'x');
    const log = createLogger({ logDir: fileAsDir, mirror: false });
    expect(() => log.info('will fail')).not.toThrow();
    await waitForSpy(spy);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
