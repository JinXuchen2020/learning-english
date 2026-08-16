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

  /** 构造一个 TTS 专用 provider：synthesize 成功，其余方法抛 unsupported。 */
  function ttsOnlyProvider(name: string): AiProvider {
    return {
      name: name as any,
      chat: () => {
        throw new Error(`${name} chat unsupported`);
      },
      chatWithImage: () => {
        throw new Error(`${name} chatWithImage unsupported`);
      },
      transcribe: () => {
        throw new Error(`${name} transcribe unsupported`);
      },
      assessPronunciation: () => {
        throw new Error(`${name} assessPronunciation unsupported`);
      },
      synthesize: () => Promise.resolve({ mimeType: 'audio/mp3' }),
    } as AiProvider;
  }

  it('TTS 专用 provider 仅参与 synthesize，绝不进入 chat 链（AI-407 回归）', async () => {
    const real = fakeProvider({ name: 'agnes', text: 'hi' });
    const tts = ttsOnlyProvider('edge-tts');
    const chain = new FallbackAiProvider([real], [real, tts]);
    // chat 只走通用链，不会触达 tts 的 chat()
    expect((await chain.chat([] as ChatMessage[])).text).toBe('hi');
    // synthesize 走 tts 链，tts 兜底成功
    expect((await chain.synthesize('x')).mimeType).toBe('audio/mp3');
  });

  it('通用链 chat 失败 → 抛出真实上游错误，不被 TTS provider 的 unsupported 盖掉', async () => {
    const failing = fakeProvider({ name: 'agnes', fail: true });
    const tts = ttsOnlyProvider('edge-tts');
    const chain = new FallbackAiProvider([failing], [failing, tts]);
    // 关键断言：错误应为上游 agnes 的失败，而非 edge-tts 的 unsupported
    await expect(chain.chat([])).rejects.toThrow('agnes down');
    await expect(chain.chat([])).rejects.not.toThrow(/edge-tts/);
  });
});
