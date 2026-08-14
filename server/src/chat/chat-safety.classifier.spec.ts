import { LlmSafetyClassifier } from './chat-safety.classifier';
import { AiProvider, ChatMessage, ChatOptions, ChatResult } from '../ai/ai-provider.interface';

/** 构造假 provider：按给定 text 返回，或抛错。 */
function fakeProvider(opts: { text?: string; throwErr?: Error }): AiProvider {
  return {
    name: 'bigmodel',
    chat: async (_messages: ChatMessage[], _options?: ChatOptions): Promise<ChatResult> => {
      if (opts.throwErr) throw opts.throwErr;
      return { text: opts.text ?? 'safe' };
    },
    chatWithImage: async () => ({ text: '' }),
    transcribe: async () => ({ text: '', confidence: 0, durationMs: 0 }),
    assessPronunciation: async () => ({
      score: 0,
      readableText: '',
      weakPhonemes: [],
      feedback: '',
      mascotExpr: 'thinking',
    }),
    synthesize: async () => ({ mimeType: 'audio/mp3' }),
  };
}

describe('LlmSafetyClassifier (AI-406 / AI-713)', () => {
  it('模型返回 "safe" → 分类为安全（true）', async () => {
    const c = new LlmSafetyClassifier(fakeProvider({ text: 'safe' }));
    expect(await c.classify('hello fox')).toBe(true);
  });

  it('模型返回含 "unsafe" → 分类为不安全（false）', async () => {
    const c = new LlmSafetyClassifier(fakeProvider({ text: 'unsafe' }));
    expect(await c.classify('some harmful text')).toBe(false);
  });

  it('模型返回大写 UNSAFE → 同样判不安全（false）', async () => {
    const c = new LlmSafetyClassifier(fakeProvider({ text: 'UNSAFE' }));
    expect(await c.classify('x')).toBe(false);
  });

  it('未注入 provider → fail-open 放行（true）', async () => {
    const c = new LlmSafetyClassifier(undefined as unknown as AiProvider);
    expect(await c.classify('anything')).toBe(true);
  });

  it('provider 抛错（网络/超时）→ fail-open 放行（true）', async () => {
    const c = new LlmSafetyClassifier(fakeProvider({ throwErr: new Error('network down') }));
    expect(await c.classify('anything')).toBe(true);
  });

  it('模型返回无法判定（空/其他词）→ 视为安全放行（true）', async () => {
    const c = new LlmSafetyClassifier(fakeProvider({ text: 'i am not sure' }));
    expect(await c.classify('anything')).toBe(true);
  });
});
