import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createLogger, serializeMeta, formatLine } from './logger';

const tick = () => new Promise((r) => setTimeout(r, 50));

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
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-test-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes a dated log file with level + message + meta', async () => {
    const log = createLogger({ logDir: dir, mirror: false });
    log.info('hello');
    log.warn('careful');
    log.error('bad', { code: 1 });
    await tick();
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
    await tick();
    const files = fs.readdirSync(dir);
    const content = fs.readFileSync(path.join(dir, files[0]), 'utf8');
    expect(content).toContain('[INFO] no-meta');
    expect(content).not.toContain('{}');
  });

  it('respects minLevel (skips lower levels, writes the rest)', async () => {
    const log = createLogger({ logDir: dir, mirror: false, minLevel: 'error' });
    log.debug('ignored');
    log.error('kept');
    await tick();
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
    await new Promise((r) => setTimeout(r, 10));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not crash when the log dir is invalid (best-effort)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const fileAsDir = path.join(dir, 'not-a-dir');
    fs.writeFileSync(fileAsDir, 'x');
    const log = createLogger({ logDir: fileAsDir, mirror: false });
    expect(() => log.info('will fail')).not.toThrow();
    await tick();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
