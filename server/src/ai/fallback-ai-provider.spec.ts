import { FallbackAiProvider } from './fallback-ai-provider';
import { AiProvider, ChatMessage, ChatResult } from './ai-provider.interface';

/** 构造一个可控的假 provider，按配置决定是否成功。 */
function fakeProvider(opts: {
  name: string;
  fail?: boolean;
  text?: string;
  calls?: number[];
}): AiProvider & { calls: number[] } {
  const calls = opts.calls ?? [];
  return {
    name: opts.name as any,
    calls,
    async chat(): Promise<ChatResult> {
      calls.push(1);
      if (opts.fail) throw new Error(`${opts.name} down`);
      return { text: opts.text ?? opts.name };
    },
    async chatWithImage(): Promise<ChatResult> {
      calls.push(1);
      if (opts.fail) throw new Error(`${opts.name} down`);
      return { text: opts.text ?? opts.name };
    },
    async transcribe() {
      calls.push(1);
      if (opts.fail) throw new Error(`${opts.name} down`);
      return { text: 't', confidence: 1 };
    },
    async assessPronunciation() {
      calls.push(1);
      if (opts.fail) throw new Error(`${opts.name} down`);
      return { score: 90, readableText: 'r', weakPhonemes: [], feedback: 'f', mascotExpr: 'happy' };
    },
    async synthesize() {
      calls.push(1);
      if (opts.fail) throw new Error(`${opts.name} down`);
      return { mimeType: 'audio/mp3' };
    },
  } as AiProvider & { calls: number[] };
}

describe('FallbackAiProvider (AI-713 续)', () => {
  it('name 取首个 provider 之名', () => {
    const p = new FallbackAiProvider([fakeProvider({ name: 'agnes' }), fakeProvider({ name: 'zhipu' })]);
    expect(p.name).toBe('agnes');
  });

  it('主用成功 → 不调用兜底', async () => {
    const primary = fakeProvider({ name: 'agnes', text: 'from-agnes' });
    const fb = fakeProvider({ name: 'zhipu' });
    const chain = new FallbackAiProvider([primary, fb]);
    const res = await chain.chat([] as ChatMessage[]);
    expect(res.text).toBe('from-agnes');
    expect(primary.calls).toHaveLength(1);
    expect(fb.calls).toHaveLength(0);
  });

  it('主用失败 → 自动切兜底', async () => {
    const primary = fakeProvider({ name: 'agnes', fail: true });
    const fb = fakeProvider({ name: 'zhipu', text: 'from-zhipu' });
    const chain = new FallbackAiProvider([primary, fb]);
    const res = await chain.chat([] as ChatMessage[]);
    expect(res.text).toBe('from-zhipu');
    expect(primary.calls).toHaveLength(1);
    expect(fb.calls).toHaveLength(1);
  });

  it('全部失败 → 抛最后一个错误', async () => {
    const primary = fakeProvider({ name: 'agnes', fail: true });
    const fb = fakeProvider({ name: 'zhipu', fail: true });
    const chain = new FallbackAiProvider([primary, fb]);
    await expect(chain.chat([])).rejects.toThrow('zhipu down');
    expect(primary.calls).toHaveLength(1);
    expect(fb.calls).toHaveLength(1);
  });

  it('对 chatWithImage/transcribe/assess/synthesize 同样按顺序兜底', async () => {
    const primary = fakeProvider({ name: 'agnes', fail: true });
    const fb = fakeProvider({ name: 'zhipu', text: 'ok' });
    const chain = new FallbackAiProvider([primary, fb]);
    expect((await chain.chatWithImage('p', { data: 'd', mimeType: 'image/png' })).text).toBe('ok');
    expect((await chain.transcribe({ data: 'x', mimeType: 'audio/wav' })).text).toBe('t');
    expect((await chain.assessPronunciation({ data: 'x', mimeType: 'audio/wav' }, 'cat')).score).toBe(90);
    expect((await chain.synthesize('hi')).mimeType).toBe('audio/mp3');
  });
});
