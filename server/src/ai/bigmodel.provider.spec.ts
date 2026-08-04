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
): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
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

    it('transcribe returns degraded result without throwing', async () => {
      const res = await p.transcribe({ data: Buffer.from('x'), mimeType: 'audio/wav' });
      expect(res).toEqual({ text: '', confidence: 0, durationMs: 0 });
    });

    it('assessPronunciation returns degraded result echoing reference text', async () => {
      const res = await p.assessPronunciation(
        { data: 'y', mimeType: 'audio/wav' },
        'cat',
      );
      expect(res.score).toBe(0);
      expect(res.readableText).toBe('cat');
      expect(res.mascotExpr).toBe('thinking');
    });

    it('synthesize returns degraded result without throwing', async () => {
      const res = await p.synthesize('hello');
      expect(res.mimeType).toBe('audio/mp3');
      expect(res.audioBase64).toBe('');
    });
  });
});
