import {
  LoggedAiProvider,
  truncate,
  AI_MODULE_TAG_RESOLVER_TOKEN,
} from './logged-ai-provider';
import { UserIdResolver } from './usage-limited-ai-provider';
import { AiCallLogService } from './ai-call-log.service';
import { AiCallLogEntry } from './ai-call-log.entity';
import { logger } from '../common/logger/logger';
import { AiProvider, ChatResult } from './ai-provider.interface';

/** 一个可控的假内层 provider，每个方法都是 jest.fn。 */
function makeFakeInner(name: 'mock' | 'bigmodel' = 'mock') {
  return {
    name,
    chat: jest.fn(async (): Promise<ChatResult> => ({
      text: 'hello',
      model: 'glm',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    })),
    chatWithImage: jest.fn(async (): Promise<ChatResult> => ({
      text: 'caption',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    })),
    transcribe: jest.fn(async () => ({ text: 'transcript text' })),
    assessPronunciation: jest.fn(async () => ({
      score: 88,
      readableText: 'read',
      weakPhonemes: ['θ'],
      feedback: 'good',
      mascotExpr: 'happy',
    })),
    synthesize: jest.fn(async () => ({
      mimeType: 'audio/mp3',
      durationMs: 1200,
    })),
  } as unknown as AiProvider;
}

const recordMock = jest.fn<Promise<boolean>, [AiCallLogEntry]>(async () => true);
const fakeCallLog = { record: recordMock } as unknown as AiCallLogService;

const userId: UserIdResolver = () => 'u1';
const moduleTag = () => 'plan';

describe('LoggedAiProvider', () => {
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // 避免测试期真实写日志文件；仅验证 record 行为。
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  });

  afterAll(() => infoSpy.mockRestore());

  it('passes through the inner provider name (契约不变)', () => {
    const p = new LoggedAiProvider(makeFakeInner('bigmodel'), fakeCallLog, userId, moduleTag);
    expect(p.name).toBe('bigmodel');
  });

  it('logs an ok chat call with extracted tokens and snippets', async () => {
    const p = new LoggedAiProvider(makeFakeInner(), fakeCallLog, userId, moduleTag);
    const res = await p.chat([{ role: 'user', content: 'hi' }]);
    expect(res.text).toBe('hello');
    expect(fakeCallLog.record).toHaveBeenCalledTimes(1);
    const entry = recordMock.mock.calls[0][0];
    expect(entry).toMatchObject({
      userId: 'u1',
      provider: 'mock',
      operation: 'chat',
      moduleTag: 'plan',
      status: 'ok',
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      errorMessage: null,
    });
    expect(entry.requestSnippet).toContain('user:hi');
    expect(entry.responseSnippet).toBe('hello');
    expect(typeof entry.durationMs).toBe('number');
  });

  it('logs an error chat call (status=error) and rethrows the original error', async () => {
    const inner = makeFakeInner();
    (inner.chat as jest.Mock).mockRejectedValueOnce(new Error('upstream down'));
    const p = new LoggedAiProvider(inner, fakeCallLog, userId, moduleTag);
    await expect(p.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('upstream down');
    const entry = recordMock.mock.calls[0][0];
    expect(entry.status).toBe('error');
    expect(entry.errorMessage).toBe('upstream down');
    expect(entry.responseSnippet).toBeNull();
  });

  it('chatWithImage snippet records the prompt but NOT the base64 image', async () => {
    const p = new LoggedAiProvider(makeFakeInner(), fakeCallLog, userId, moduleTag);
    await p.chatWithImage('describe', { data: 'BASE64VERYLONG', mimeType: 'image/png' });
    const entry = recordMock.mock.calls[0][0];
    expect(entry.operation).toBe('chatWithImage');
    expect(entry.requestSnippet).toContain('describe');
    expect(entry.requestSnippet).toContain('[image:image/png]');
    expect(entry.requestSnippet).not.toContain('BASE64VERYLONG');
  });

  it('transcribe logs audio mime only (no audio bytes) and 0 tokens', async () => {
    const p = new LoggedAiProvider(makeFakeInner(), fakeCallLog, userId, moduleTag);
    await p.transcribe({ data: Buffer.from('aud'), mimeType: 'audio/webm' });
    const entry = recordMock.mock.calls[0][0];
    expect(entry.operation).toBe('transcribe');
    expect(entry.requestSnippet).toBe('audio[audio/webm]');
    expect(entry.responseSnippet).toBe('transcript text');
    expect(entry.totalTokens).toBe(0);
  });

  it('assessPronunciation snippet includes score + readable text', async () => {
    const p = new LoggedAiProvider(makeFakeInner(), fakeCallLog, userId, moduleTag);
    await p.assessPronunciation({ data: 'a', mimeType: 'audio/wav' }, 'hello');
    const entry = recordMock.mock.calls[0][0];
    expect(entry.operation).toBe('assessPronunciation');
    expect(entry.requestSnippet).toBe('ref:hello');
    expect(entry.responseSnippet).toContain('score=88');
    expect(entry.responseSnippet).toContain('read');
  });

  it('synthesize snippet records mime + duration but no audio payload', async () => {
    const p = new LoggedAiProvider(makeFakeInner(), fakeCallLog, userId, moduleTag);
    await p.synthesize('say hi', 'fox');
    const entry = recordMock.mock.calls[0][0];
    expect(entry.operation).toBe('synthesize');
    expect(entry.requestSnippet).toContain('text:say hi');
    expect(entry.responseSnippet).toContain('audio[audio/mp3]');
    expect(entry.responseSnippet).toContain('1200ms');
  });

  it('truncates over-long request/response snippets', async () => {
    const inner = makeFakeInner();
    (inner.chat as jest.Mock).mockResolvedValueOnce({
      text: 'z'.repeat(500),
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
    const p = new LoggedAiProvider(inner, fakeCallLog, userId, moduleTag);
    await p.chat([{ role: 'user', content: 'a'.repeat(500) }]);
    const entry = recordMock.mock.calls[0][0];
    expect(entry.requestSnippet!.length).toBe(201); // 200 + '…'
    expect(entry.responseSnippet!.length).toBe(201);
  });

  it('uses the supplied userId / moduleTag resolvers', async () => {
    const p = new LoggedAiProvider(
      makeFakeInner(),
      fakeCallLog,
      () => 'custom-user',
      () => 'speech',
    );
    await p.chat([{ role: 'user', content: 'x' }]);
    const entry = recordMock.mock.calls[0][0];
    expect(entry.userId).toBe('custom-user');
    expect(entry.moduleTag).toBe('speech');
  });
});

describe('truncate helper', () => {
  it('returns null for null/undefined', () => {
    expect(truncate(null)).toBeNull();
    expect(truncate(undefined)).toBeNull();
  });
  it('keeps short strings intact', () => {
    expect(truncate('hi', 200)).toBe('hi');
  });
  it('truncates long strings with an ellipsis at the cap', () => {
    const t = truncate('x'.repeat(300), 200);
    expect(t!.length).toBe(201);
    expect(t!.endsWith('…')).toBe(true);
  });
});

describe('AI_MODULE_TAG_RESOLVER_TOKEN', () => {
  it('is a stable string token', () => {
    expect(typeof AI_MODULE_TAG_RESOLVER_TOKEN).toBe('string');
    expect(AI_MODULE_TAG_RESOLVER_TOKEN.length).toBeGreaterThan(0);
  });
});
