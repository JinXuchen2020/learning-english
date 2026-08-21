import { createRetryableProvider, RetryableAiProvider } from './retryable-ai-provider';
import { ConcurrencyLimiter } from './concurrency-limiter';
import { AiProvider, ChatMessage, ChatOptions, ImageInput, UnsupportedMethodError } from './ai-provider.interface';
import { AiProviderException, AiAccessError } from './ai-provider.errors';

const noDelay = async () => undefined;

/** 构造一个可控的假 inner provider，便于验证包装层行为。 */
function fakeInner(overrides: Partial<AiProvider> = {}): AiProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    name: 'bigmodel',
    calls,
    async chat() {
      calls.push('chat');
      return { text: 'ok' };
    },
    async chatWithImage() {
      calls.push('chatWithImage');
      return { text: 'img' };
    },
    async transcribe() {
      calls.push('transcribe');
      return { text: 't', confidence: 1 };
    },
    async assessPronunciation() {
      calls.push('assess');
      return { score: 90, readableText: 'r', weakPhonemes: [], feedback: 'f', mascotExpr: 'happy' };
    },
    async synthesize() {
      calls.push('synthesize');
      return { mimeType: 'audio/mp3' };
    },
    ...overrides,
  } as AiProvider & { calls: string[] };
}

describe('RetryableAiProvider', () => {
  it('retries chat once on a transient 5xx then succeeds', async () => {
    let n = 0;
    const inner = fakeInner({
      chat: async () => {
        n += 1;
        if (n === 1) throw new AiProviderException('503', { statusCode: 503 });
        return { text: 'recovered' };
      },
    });
    const p = createRetryableProvider(inner, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10, factor: 2, delay: noDelay }, new ConcurrencyLimiter(2));
    const res = await p.chat([] as ChatMessage[]);
    expect(res.text).toBe('recovered');
    expect(n).toBe(2);
  });

  it('throws the last recognizable error when chat keeps failing transiently', async () => {
    const inner = fakeInner({
      chat: async () => {
        throw new AiProviderException('down', { statusCode: 0, code: 'NETWORK' });
      },
    });
    const p = createRetryableProvider(inner, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10, factor: 2, delay: noDelay }, new ConcurrencyLimiter(2));
    await expect(p.chat([])).rejects.toMatchObject({ statusCode: 0, code: 'NETWORK' });
  });

  it('honors per-call maxAttempts=1 override (no retry on transient error)', async () => {
    let n = 0;
    const inner = fakeInner({
      chat: async () => {
        n += 1;
        throw new AiProviderException('503', { statusCode: 503 });
      },
    });
    const p = createRetryableProvider(
      inner,
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10, factor: 2, delay: noDelay },
      new ConcurrencyLimiter(2),
    );
    await expect(p.chat([] as ChatMessage[], { maxAttempts: 1 })).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(n).toBe(1);
  });

  it('does NOT retry chat on an access error', async () => {
    let n = 0;
    const inner = fakeInner({
      chat: async () => {
        n += 1;
        throw new AiAccessError('forbidden', { statusCode: 403 });
      },
    });
    const p = createRetryableProvider(inner, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10, factor: 2, delay: noDelay }, new ConcurrencyLimiter(2));
    await expect(p.chat([])).rejects.toBeInstanceOf(AiAccessError);
    expect(n).toBe(1);
  });

  it('retries chatWithImage on transient errors then succeeds', async () => {
    let n = 0;
    const inner = fakeInner({
      chatWithImage: async () => {
        n += 1;
        if (n === 1) throw new AiProviderException('429', { statusCode: 429 });
        return { text: 'vision' };
      },
    });
    const p = createRetryableProvider(inner, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10, factor: 2, delay: noDelay }, new ConcurrencyLimiter(2));
    const res = await p.chatWithImage('p', { data: 'd', mimeType: 'image/png' } as ImageInput);
    expect(res.text).toBe('vision');
    expect(n).toBe(2);
  });

  it('delegates transcribe directly (no retry, no limiter wrap needed)', async () => {
    const inner = fakeInner();
    const p = createRetryableProvider(inner, { maxAttempts: 3, delay: noDelay }, new ConcurrencyLimiter(2));
    const res = await p.transcribe({ data: 'x', mimeType: 'audio/wav' });
    expect(res.text).toBe('t');
    expect(inner.calls).toEqual(['transcribe']);
  });

  it('delegates assessPronunciation directly', async () => {
    const inner = fakeInner();
    const p = createRetryableProvider(inner, { maxAttempts: 3, delay: noDelay }, new ConcurrencyLimiter(2));
    const res = await p.assessPronunciation({ data: 'x', mimeType: 'audio/wav' }, 'cat');
    expect(res.score).toBe(90);
    expect(inner.calls).toEqual(['assess']);
  });

  it('delegates synthesize directly', async () => {
    const inner = fakeInner();
    const p = createRetryableProvider(inner, { maxAttempts: 3, delay: noDelay }, new ConcurrencyLimiter(2));
    const res = await p.synthesize('hi');
    expect(res.mimeType).toBe('audio/mp3');
    expect(inner.calls).toEqual(['synthesize']);
  });

  it('streamChat 委托内层 provider（逐 chunk 透传）', async () => {
    const inner = fakeInner({
      streamChat: async function* () {
        yield 'Hello ';
        yield 'world';
      },
    });
    const p = createRetryableProvider(inner, { maxAttempts: 3, delay: noDelay }, new ConcurrencyLimiter(2));
    const out: string[] = [];
    for await (const chunk of p.streamChat([{ role: 'user', content: 'hi' }])) {
      out.push(chunk);
    }
    expect(out.join('')).toBe('Hello world');
    expect(inner.calls).toEqual([]); // 委托调用不记录在 calls（streamChat 未 push）
  });

  it('streamChat 内层不支持 → 抛 UnsupportedMethodError（不静默产出空流）', async () => {
    const inner = fakeInner(); // 无 streamChat 方法
    const p = createRetryableProvider(inner, { maxAttempts: 3, delay: noDelay }, new ConcurrencyLimiter(2));
    await expect(
      (async () => {
        for await (const _ of p.streamChat([{ role: 'user', content: 'hi' }])) {
          /* drain */
        }
      })(),
    ).rejects.toBeInstanceOf(UnsupportedMethodError);
  });

  it('streamChat 透传 signal 到内层（取消中断链路不丢）', async () => {
    const ac = new AbortController();
    let seenSignal: AbortSignal | undefined;
    const inner = fakeInner({
      streamChat: async function* (
        _msgs: ChatMessage[],
        options?: ChatOptions & { signal?: AbortSignal },
      ) {
        seenSignal = options?.signal;
        yield 'ok';
      },
    });
    const p = createRetryableProvider(inner, { maxAttempts: 3, delay: noDelay }, new ConcurrencyLimiter(2));
    for await (const _ of p.streamChat([{ role: 'user', content: 'hi' }], { signal: ac.signal })) {
      /* drain */
    }
    expect(seenSignal).toBe(ac.signal);
  });

  it('passes through the inner provider name', () => {
    const inner = fakeInner({ name: 'bigmodel' });
    const p = createRetryableProvider(inner, { maxAttempts: 3, delay: noDelay }, new ConcurrencyLimiter(2));
    expect(p.name).toBe('bigmodel');
  });

  it('uses a default limiter when none is supplied', async () => {
    const inner = fakeInner();
    const p = createRetryableProvider(inner, { maxAttempts: 3, delay: noDelay });
    expect(p.name).toBe('bigmodel');
    await expect(p.chat([])).resolves.toMatchObject({ text: 'ok' });
  });

  it('falls back to default retry options and limiter when constructed bare', async () => {
    const inner = fakeInner();
    const p = new RetryableAiProvider(inner);
    expect(p.name).toBe('bigmodel');
    await expect(p.chat([])).resolves.toMatchObject({ text: 'ok' });
    await expect(p.transcribe({ data: 'x', mimeType: 'audio/wav' })).resolves.toMatchObject({ text: 't' });
  });
});
