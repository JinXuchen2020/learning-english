import {
  UsageLimitedAiProvider,
  createUsageLimitedProvider,
  UserIdResolver,
} from './usage-limited-ai-provider';
import { AiUsageLimitService } from './ai-usage-limit.service';
import { AiQuotaExceededError } from './ai-quota-error';
import { AiProvider, ChatMessage } from './ai-provider.interface';

/** 假内层 provider，每个方法都是 jest.fn，便于断言调用。 */
function makeInner() {
  return {
    name: 'mock' as const,
    chat: jest.fn(async (): Promise<any> => ({
      text: 'hi',
      usage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 },
    })),
    chatWithImage: jest.fn(async (): Promise<any> => ({ text: 'img' })),
    transcribe: jest.fn(async (): Promise<any> => ({ text: 't' })),
    assessPronunciation: jest.fn(async (): Promise<any> => ({
      score: 80,
      readableText: 'x',
      weakPhonemes: [],
      feedback: '',
      mascotExpr: 'happy',
    })),
    synthesize: jest.fn(async (): Promise<any> => ({ mimeType: 'audio/mp3' })),
  };
}

/** 假配额服务：默认放行，可注入拦截 / 计数。 */
function makeUsage() {
  return {
    assertWithinQuota: jest.fn(async () => undefined),
    recordUsage: jest.fn(async () => ({}) as any),
  } as Pick<AiUsageLimitService, 'assertWithinQuota' | 'recordUsage'>;
}

const RESOLVER: UserIdResolver = () => 'user-1';

describe('UsageLimitedAiProvider', () => {
  it('passes through the inner provider name (contract unchanged)', () => {
    const p = new UsageLimitedAiProvider(makeInner() as unknown as AiProvider, makeUsage() as any, RESOLVER);
    expect(p.name).toBe('mock');
  });

  describe('chat', () => {
    it('asserts quota, calls inner, then records usage with real token count', async () => {
      const inner = makeInner();
      const usage = makeUsage();
      const p = new UsageLimitedAiProvider(inner as unknown as AiProvider, usage as any, RESOLVER);
      const msgs: ChatMessage[] = [{ role: 'user', content: 'hello' }];
      const r = await p.chat(msgs);
      expect(usage.assertWithinQuota).toHaveBeenCalledWith('user-1');
      expect(inner.chat).toHaveBeenCalledWith(msgs, undefined);
      expect(usage.recordUsage).toHaveBeenCalledWith('user-1', 10);
      expect(r.text).toBe('hi');
    });

    it('does NOT call inner or record when quota is exceeded', async () => {
      const inner = makeInner();
      const usage = makeUsage();
      usage.assertWithinQuota = jest.fn(async () => {
        throw new AiQuotaExceededError('over', {
          userId: 'user-1',
          date: '2026-01-01',
          callLimit: 5,
          tokenLimit: 100,
          callCount: 5,
          tokenCount: 0,
        });
      });
      const p = new UsageLimitedAiProvider(inner as unknown as AiProvider, usage as any, RESOLVER);
      await expect(p.chat([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(AiQuotaExceededError);
      expect(inner.chat).not.toHaveBeenCalled();
      expect(usage.recordUsage).not.toHaveBeenCalled();
    });

    it('does NOT record usage when inner throws (failures are not billed)', async () => {
      const inner = makeInner();
      inner.chat = jest.fn(async () => {
        throw new Error('provider down');
      });
      const usage = makeUsage();
      const p = new UsageLimitedAiProvider(inner as unknown as AiProvider, usage as any, RESOLVER);
      await expect(p.chat([{ role: 'user', content: 'x' }])).rejects.toThrow('provider down');
      expect(usage.assertWithinQuota).toHaveBeenCalled();
      expect(usage.recordUsage).not.toHaveBeenCalled();
    });
  });

  describe('other methods', () => {
    it('chatWithImage records 0 tokens when no usage is returned', async () => {
      const inner = makeInner();
      const usage = makeUsage();
      const p = new UsageLimitedAiProvider(inner as unknown as AiProvider, usage as any, RESOLVER);
      await p.chatWithImage('describe', { data: 'b64', mimeType: 'image/png' });
      expect(inner.chatWithImage).toHaveBeenCalled();
      expect(usage.recordUsage).toHaveBeenCalledWith('user-1', 0);
    });

    it('transcribe / assessPronunciation / synthesize all bill 0 tokens and delegate', async () => {
      const inner = makeInner();
      const usage = makeUsage();
      const p = new UsageLimitedAiProvider(inner as unknown as AiProvider, usage as any, RESOLVER);
      await p.transcribe({ data: 'x', mimeType: 'audio/webm' });
      await p.assessPronunciation({ data: 'x', mimeType: 'audio/webm' }, 'ref');
      await p.synthesize('text');
      expect(inner.transcribe).toHaveBeenCalled();
      expect(inner.assessPronunciation).toHaveBeenCalled();
      expect(inner.synthesize).toHaveBeenCalled();
      expect(usage.recordUsage).toHaveBeenCalledTimes(3);
      expect(usage.recordUsage).toHaveBeenCalledWith('user-1', 0);
    });
  });

  describe('userId resolution', () => {
    it('uses the provided resolver to scope quota per user', async () => {
      const inner = makeInner();
      const usage = makeUsage();
      const resolver: UserIdResolver = () => 'abc';
      const p = new UsageLimitedAiProvider(inner as unknown as AiProvider, usage as any, resolver);
      await p.chat([{ role: 'user', content: 'x' }]);
      expect(usage.assertWithinQuota).toHaveBeenCalledWith('abc');
    });
  });

  describe('createUsageLimitedProvider', () => {
    it('builds a UsageLimitedAiProvider instance', () => {
      const p = createUsageLimitedProvider(makeInner() as unknown as AiProvider, makeUsage() as any);
      expect(p).toBeInstanceOf(UsageLimitedAiProvider);
    });
  });
});
