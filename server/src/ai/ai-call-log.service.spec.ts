import { AiCallLogService } from './ai-call-log.service';
import { AiCallLog, AiCallLogEntry } from './ai-call-log.entity';
import { logger } from '../common/logger/logger';

/** 假 TypeORM 仓库：create 原样返回、save 成功回显。 */
const fakeRepo = {
  create: jest.fn((e: Partial<AiCallLog>) => e as AiCallLog),
  save: jest.fn(async (e: AiCallLog) => e),
};

function makeEntry(overrides: Partial<AiCallLogEntry> = {}): AiCallLogEntry {
  return {
    userId: 'u1',
    provider: 'mock',
    operation: 'chat',
    moduleTag: 'plan',
    durationMs: 42,
    status: 'ok',
    ...overrides,
  };
}

describe('AiCallLogService', () => {
  let service: AiCallLogService;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiCallLogService(fakeRepo as any);
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterAll(() => warnSpy.mockRestore());

  it('records an ok entry with all fields and numeric defaults', async () => {
    const res = await service.record(
      makeEntry({ promptTokens: 10, completionTokens: 5, totalTokens: 15 }),
    );
    expect(res).toBe(true);
    expect(fakeRepo.save).toHaveBeenCalledTimes(1);
    const row = fakeRepo.save.mock.calls[0][0] as AiCallLog;
    expect(row.userId).toBe('u1');
    expect(row.provider).toBe('mock');
    expect(row.operation).toBe('chat');
    expect(row.moduleTag).toBe('plan');
    expect(row.durationMs).toBe(42);
    expect(row.status).toBe('ok');
    expect(row.promptTokens).toBe(10);
    expect(row.completionTokens).toBe(5);
    expect(row.totalTokens).toBe(15);
    expect(row.errorMessage).toBeNull();
  });

  it('records an error entry with status=error and errorMessage', async () => {
    await service.record(makeEntry({ status: 'error', errorMessage: 'boom' }));
    const row = fakeRepo.save.mock.calls[0][0] as AiCallLog;
    expect(row.status).toBe('error');
    expect(row.errorMessage).toBe('boom');
  });

  it('truncates an over-long errorMessage to the 255-char cap (+ ellipsis)', async () => {
    const long = 'x'.repeat(400);
    await service.record(makeEntry({ status: 'error', errorMessage: long }));
    const row = fakeRepo.save.mock.calls[0][0] as AiCallLog;
    expect(row.errorMessage!.length).toBe(256); // 255 + '…'
    expect(row.errorMessage!.endsWith('…')).toBe(true);
  });

  it('truncates over-long request/response snippets to 200 chars (+ ellipsis)', async () => {
    const long = 'y'.repeat(500);
    await service.record(
      makeEntry({ requestSnippet: long, responseSnippet: long }),
    );
    const row = fakeRepo.save.mock.calls[0][0] as AiCallLog;
    expect(row.requestSnippet!.length).toBe(201);
    expect(row.responseSnippet!.length).toBe(201);
  });

  it('does NOT throw when the DB write fails (best-effort), returns false', async () => {
    fakeRepo.save.mockRejectedValueOnce(new Error('disk full'));
    const res = await service.record(makeEntry());
    expect(res).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('审计落库失败'),
      expect.objectContaining({ operation: 'chat' }),
    );
  });
});
