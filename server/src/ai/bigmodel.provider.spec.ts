import {
  BigModelProvider,
  AiProviderException,
  BigModelConfig,
} from './bigmodel.provider';
import { ChatMessage } from './ai-provider.interface';

/** 构造一个 Response 桩，仅实现 provider 用到的字段。 */
function makeResponse(
  body: unknown,
  status = 200,
  ok: boolean = status >= 200 && status < 300,
  opts: { contentType?: string; arrayBuffer?: ArrayBuffer } = {},
): Response {
  const headers = {
    get: (name: string) =>
      name.toLowerCase() === 'content-type' ? (opts.contentType ?? '') : null,
  };
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers,
    json: async () => body,
    arrayBuffer: async () => opts.arrayBuffer ?? new ArrayBuffer(0),
  } as unknown as Response;
}

/** 记录 fetch 调用并返回预设响应；也可抛错以模拟网络/超时异常。 */
function recordingFetch(resolver: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init: init as RequestInit });
    return resolver(u, init as RequestInit);
  };
  return { fn, calls };
}

const SAMPLE_MESSAGES: ChatMessage[] = [
  { role: 'system', content: 'You are a helpful fox.' },
  { role: 'user', content: 'Hello' },
];

describe('BigModelProvider', () => {
  it('exposes a valid ProviderName', () => {
    const p = new BigModelProvider({ apiKey: 'k' });
    expect(p.name).toBe('bigmodel');
  });

  describe('chat', () => {
    it('returns ChatResult with content, reasoning_content, usage and model', async () => {
      const { fn } = recordingFetch(() =>
        makeResponse({
          model: 'glm-4.7-flash',
          choices: [
            {
              message: {
                content: 'Hi little one!',
                reasoning_content: 'thinking...',
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      );
      const p = new BigModelProvider({ apiKey: 'k', model: 'glm-4.7-flash' }, fn);
      const res = await p.chat(SAMPLE_MESSAGES);

      expect(res.text).toBe('Hi little one!');
      expect(res.reasoningContent).toBe('thinking...');
      expect(res.model).toBe('glm-4.7-flash');
      expect(res.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
    });

    it('omits reasoningContent when absent', async () => {
      const { fn } = recordingFetch(() =>
        makeResponse({ choices: [{ message: { content: 'plain' } }] }),
      );
      const p = new BigModelProvider({ apiKey: 'k' }, fn);
      const res = await p.chat(SAMPLE_MESSAGES);
      expect(res.text).toBe('plain');
      expect(res.reasoningContent).toBeUndefined();
      expect(res.usage).toBeUndefined();
    });

    it('forwards temperature and maxTokens into the request body', async () => {
      const { fn, calls } = recordingFetch(() =>
        makeResponse({ choices: [{ message: { content: 'ok' } }] }),
      );
      const p = new BigModelProvider({ apiKey: 'k', model: 'm1' }, fn);
      await p.chat(SAMPLE_MESSAGES, { temperature: 0.5, maxTokens: 1024 });
      const body = JSON.parse(calls[0].init.body as string);
      expect(body.model).toBe('m1');
      expect(body.temperature).toBe(0.5);
      expect(body.max_tokens).toBe(1024);
      expect(body.messages).toHaveLength(2);
    });

    it('falls back to env-free defaults when no config passed, but key missing -> 401', async () => {
      const { fn } = recordingFetch(() => makeResponse({}, 200));
      const p = new BigModelProvider({}, fn); // 无 apiKey
      await expect(p.chat(SAMPLE_MESSAGES)).rejects.toBeInstanceOf(AiProviderException);
      await expect(p.chat(SAMPLE_MESSAGES)).rejects.toMatchObject({ statusCode: 401 });
    });

    it('throws 502 when response lacks content', async () => {
      const { fn } = recordingFetch(() => makeResponse({ choices: [{ message: {} }] }));
      const p = new BigModelProvider({ apiKey: 'k' }, fn);
      await expect(p.chat(SAMPLE_MESSAGES)).rejects.toMatchObject({ statusCode: 502 });
    });

    it('maps 401/403 to auth failure', async () => {
      const { fn } = recordingFetch(() =>
        makeResponse({ error: { message: 'invalid api key' } }, 401),
      );
      const p = new BigModelProvider({ apiKey: 'k' }, fn);
      const err = (await p.chat(SAMPLE_MESSAGES).catch((e) => e)) as AiProviderException;
      expect(err).toBeInstanceOf(AiProviderException);
      expect(err.statusCode).toBe(401);
      expect(err.message).toContain('鉴权失败');
    });

    it('maps 429 to rate-limit with provider code', async () => {
      const { fn } = recordingFetch(() =>
        makeResponse({ error: { message: 'rate limit', code: 1305 } }, 429),
      );
      const p = new BigModelProvider({ apiKey: 'k' }, fn);
      const err = (await p.chat(SAMPLE_MESSAGES).catch((e) => e)) as AiProviderException;
      expect(err.statusCode).toBe(429);
      expect(err.code).toBe(1305);
      expect(err.message).toContain('限流');
    });

    it('maps other non-2xx to interface error', async () => {
      const { fn } = recordingFetch(() =>
        makeResponse({ error: { message: 'boom' } }, 500),
      );
      const p = new BigModelProvider({ apiKey: 'k' }, fn);
      const err = (await p.chat(SAMPLE_MESSAGES).catch((e) => e)) as AiProviderException;
      expect(err.statusCode).toBe(500);
      expect(err.message).toContain('接口错误');
    });

    it('falls back to statusText when error body is unparseable', async () => {
      const { fn } = recordingFetch(() => {
        const res = makeResponse({}, 502, false) as unknown as Response;
        // 覆盖 res.json() 解析失败的分支
        (res as { json: () => Promise<unknown> }).json = async () => {
          throw new SyntaxError('invalid json');
        };
        return res;
      });
      const p = new BigModelProvider({ apiKey: 'k' }, fn);
      const err = (await p.chat(SAMPLE_MESSAGES).catch((e) => e)) as AiProviderException;
      expect(err.statusCode).toBe(502);
      expect(err.message).toContain('接口错误');
    });

    it('maps network rejection to NETWORK error', async () => {
      const fn = async () => {
        throw new Error('ECONNRESET');
      };
      const p = new BigModelProvider({ apiKey: 'k' }, fn as never);
      const err = (await p.chat(SAMPLE_MESSAGES).catch((e) => e)) as AiProviderException;
      expect(err.statusCode).toBe(0);
      expect(err.code).toBe('NETWORK');
    });

    it('maps AbortError to 504 timeout', async () => {
      const fn = async () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        throw e;
      };
      const p = new BigModelProvider({ apiKey: 'k' }, fn as never);
      const err = (await p.chat(SAMPLE_MESSAGES).catch((e) => e)) as AiProviderException;
      expect(err.statusCode).toBe(504);
      expect(err.message).toContain('超时');
    });
  });

  describe('chatWithImage', () => {
    it('builds data URL and returns content', async () => {
      const { fn, calls } = recordingFetch(() =>
        makeResponse({ choices: [{ message: { content: 'a red apple' } }] }),
      );
      const p = new BigModelProvider({ apiKey: 'k' }, fn);
      const res = await p.chatWithImage(
        'name the object',
        { data: 'BASE64DATA', mimeType: 'image/png' },
        { model: 'glm-4.6v-flash' },
      );
      expect(res.text).toBe('a red apple');
      const body = JSON.parse(calls[0].init.body as string);
      expect(body.model).toBe('glm-4.6v-flash');
      expect(body.messages[0].content[1].image_url.url).toBe(
        'data:image/png;base64,BASE64DATA',
      );
    });

    it('throws 502 on malformed vision response', async () => {
      const { fn } = recordingFetch(() => makeResponse({ choices: [] }));
      const p = new BigModelProvider({ apiKey: 'k' }, fn);
      await expect(
        p.chatWithImage('x', { data: 'd', mimeType: 'image/jpeg' }),
      ).rejects.toMatchObject({ statusCode: 502 });
    });
  });

  describe('degraded capabilities (AI-102 scope-out)', () => {
    const p = new BigModelProvider({ apiKey: 'k' });

    // BigModel STT 不在范围内：必须抛 501 让 FallbackAiProvider 继续尝试下一个 provider。
    // 若返回空文本（不抛错），FallbackAiProvider 会把空结果当"成功"消费，导致 STT 静默失败（分数恒为 0）。
    it('transcribe throws 501 STT_NOT_SUPPORTED (out of scope, lets fallback continue)', async () => {
      await expect(
        p.transcribe({ data: Buffer.from('x'), mimeType: 'audio/wav' }),
      ).rejects.toMatchObject({ statusCode: 501, code: 'STT_NOT_SUPPORTED' });
    });

    // 同理，发音评测未接入也必须抛错，由 EdgeTts/浏览器 Web Speech API 兜底。
    it('assessPronunciation throws 501 PRONUNCIATION_NOT_SUPPORTED (out of scope, lets fallback continue)', async () => {
      await expect(
        p.assessPronunciation({ data: 'y', mimeType: 'audio/wav' }, 'cat'),
      ).rejects.toMatchObject({ statusCode: 501, code: 'PRONUNCIATION_NOT_SUPPORTED' });
    });
  });

  describe('synthesize (real TTS, AI-402)', () => {
    it('sends correct request body to the GLM-TTS endpoint with fox voice default', async () => {
      const { fn, calls } = recordingFetch(() =>
        makeResponse({}, 200, true, {
          contentType: 'audio/mpeg',
          arrayBuffer: new TextEncoder().encode('FAKEMP3').buffer,
        }),
      );
      const p = new BigModelProvider(
        { apiKey: 'k', ttsVoice: 'tongtong', ttsModel: 'glm-tts' },
        fn,
      );
      await p.synthesize('Hello little fox');
      expect(calls[0].url).toBe('https://open.bigmodel.cn/api/paas/v4/audio/speech');
      const body = JSON.parse(calls[0].init.body as string);
      expect(body.model).toBe('glm-tts');
      expect(body.input).toBe('Hello little fox');
      expect(body.voice).toBe('tongtong');
      // 注意：刻意不发送 response_format。智谱 glm-tts 收到 response_format:'mp3' 会返回 400，
      // TTS 兜底的音频格式由 EdgeTtsProvider（链末兜底）保证，BigModel 自身不强制。
      expect(body.response_format).toBeUndefined();
      expect(body.speed).toBe(1.0);
      expect(body.stream).toBe(false);
    });

    it('honors an explicit voice override', async () => {
      const { fn, calls } = recordingFetch(() =>
        makeResponse({}, 200, true, {
          contentType: 'audio/mpeg',
          arrayBuffer: new TextEncoder().encode('FAKEMP3').buffer,
        }),
      );
      const p = new BigModelProvider({ apiKey: 'k', ttsVoice: 'tongtong' }, fn);
      await p.synthesize('hi', 'xiaochen');
      expect(JSON.parse(calls[0].init.body as string).voice).toBe('xiaochen');
    });

    it('parses binary mp3 response into audioBase64', async () => {
      const bytes = new TextEncoder().encode('FAKEMP3');
      const { fn } = recordingFetch(() =>
        makeResponse({}, 200, true, { contentType: 'audio/mpeg', arrayBuffer: bytes.buffer }),
      );
      const p = new BigModelProvider({ apiKey: 'k' }, fn);
      const res = await p.synthesize('hi');
      expect(res.audioBase64).toBe(Buffer.from(bytes).toString('base64'));
      expect(res.mimeType).toBe('audio/mpeg');
      expect(res.audioUrl).toBeUndefined();
    });

    it('parses JSON {url} envelope into audioUrl', async () => {
      const { fn } = recordingFetch(() =>
        makeResponse({ url: 'https://host/abc.mp3' }, 200, true, {
          contentType: 'application/json',
        }),
      );
      const p = new BigModelProvider({ apiKey: 'k' }, fn);
      const res = await p.synthesize('hi');
      expect(res.audioUrl).toBe('https://host/abc.mp3');
      expect(res.audioBase64).toBeUndefined();
      expect(res.mimeType).toBe('audio/mpeg');
    });

    it('parses JSON {audio} envelope (base64) into audioBase64', async () => {
      const { fn } = recordingFetch(() =>
        makeResponse({ audio: 'BASE64AUDIO' }, 200, true, {
          contentType: 'application/json',
        }),
      );
      const p = new BigModelProvider({ apiKey: 'k' }, fn);
      const res = await p.synthesize('hi');
      expect(res.audioBase64).toBe('BASE64AUDIO');
      expect(res.audioUrl).toBeUndefined();
    });

    it('throws 502 when JSON envelope lacks audio/url', async () => {
      const { fn } = recordingFetch(() =>
        makeResponse({}, 200, true, { contentType: 'application/json' }),
      );
      const p = new BigModelProvider({ apiKey: 'k' }, fn);
      await expect(p.synthesize('hi')).rejects.toMatchObject({ statusCode: 502 });
    });

    it('throws 502 on empty binary audio', async () => {
      const { fn } = recordingFetch(() =>
        makeResponse({}, 200, true, { contentType: 'audio/mpeg', arrayBuffer: new ArrayBuffer(0) }),
      );
      const p = new BigModelProvider({ apiKey: 'k' }, fn);
      await expect(p.synthesize('hi')).rejects.toMatchObject({ statusCode: 502 });
    });

    it('throws 401 when API key is missing', async () => {
      const { fn } = recordingFetch(() => makeResponse({}, 200));
      const p = new BigModelProvider({}, fn);
      await expect(p.synthesize('hi')).rejects.toMatchObject({ statusCode: 401 });
    });

    it('maps 429 to rate-limit error', async () => {
      const { fn } = recordingFetch(() =>
        makeResponse({ error: { message: 'rate limit', code: 1305 } }, 429),
      );
      const p = new BigModelProvider({ apiKey: 'k' }, fn);
      const err = (await p.synthesize('hi').catch((e) => e)) as AiProviderException;
      expect(err.statusCode).toBe(429);
      expect(err.code).toBe(1305);
    });

    it('maps network rejection to NETWORK error', async () => {
      const fn = async () => {
        throw new Error('ECONNRESET');
      };
      const p = new BigModelProvider({ apiKey: 'k' }, fn as never);
      const err = (await p.synthesize('hi').catch((e) => e)) as AiProviderException;
      expect(err.statusCode).toBe(0);
      expect(err.code).toBe('NETWORK');
    });

    it('maps AbortError to 504 timeout', async () => {
      const fn = async () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        throw e;
      };
      const p = new BigModelProvider({ apiKey: 'k' }, fn as never);
      const err = (await p.synthesize('hi').catch((e) => e)) as AiProviderException;
      expect(err.statusCode).toBe(504);
    });
  });
});
