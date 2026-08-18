import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import { UnsupportedMethodError } from '../ai-provider.interface';

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('OpenAiCompatibleProvider (AI-705 / AI-714)', () => {
  it('chat 构造 /chat/completions 请求并返回文本', async () => {
    const fetchFn = jest.fn(
      async (_url: string, _init: RequestInit): Promise<Response> =>
        jsonResponse({ model: 'gpt-4o-mini', choices: [{ message: { content: 'hi' } }] }),
    );
    const p = new OpenAiCompatibleProvider(
      { apiKey: 'k', baseUrl: 'https://api.test/v1', model: 'gpt-4o-mini' },
      fetchFn,
    );
    const res = await p.chat([{ role: 'user', content: 'hello' }]);
    expect(res.text).toBe('hi');
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.test/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    expect(JSON.parse(init.body as string).model).toBe('gpt-4o-mini');
  });

  it('chat 缺 content 抛 AiProviderException(502)', async () => {
    const fetchFn = jest.fn(async () => jsonResponse({ choices: [{}] }));
    const p = new OpenAiCompatibleProvider({ apiKey: 'k', baseUrl: 'https://api.test/v1' }, fetchFn);
    await expect(p.chat([{ role: 'user', content: 'x' }])).rejects.toThrow(/返回结构异常/);
  });

  it('401 鉴权失败抛 AiAccessError', async () => {
    const fetchFn = jest.fn(async () =>
      jsonResponse({ error: { message: 'invalid' } }, { status: 401 }),
    );
    const p = new OpenAiCompatibleProvider({ apiKey: 'k', baseUrl: 'https://api.test/v1' }, fetchFn);
    await expect(p.chat([{ role: 'user', content: 'x' }])).rejects.toThrow(/鉴权失败/);
  });

  it('transcribe 走 audio/transcriptions 并返回 text', async () => {
    const fetchFn = jest.fn(
      async (_url: string, _init: RequestInit): Promise<Response> =>
        jsonResponse({ text: 'hello world' }),
    );
    const p = new OpenAiCompatibleProvider({ apiKey: 'k', baseUrl: 'https://api.test/v1' }, fetchFn);
    const res = await p.transcribe({ data: Buffer.from('audio'), mimeType: 'audio/webm' });
    expect(res.text).toBe('hello world');
    expect(fetchFn.mock.calls[0][0]).toContain('/audio/transcriptions');
  });

  it('synthesize 二进制音频返回 base64', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchFn = jest.fn(async () =>
      new Response(bytes, { status: 200, headers: { 'content-type': 'audio/mpeg' } }),
    );
    const p = new OpenAiCompatibleProvider({ apiKey: 'k', baseUrl: 'https://api.test/v1' }, fetchFn);
    const res = await p.synthesize('hi');
    expect(res.mimeType).toBe('audio/mpeg');
    expect(res.audioBase64).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('assessPronunciation 标注 unsupported 降级', async () => {
    const fetchFn = jest.fn();
    const p = new OpenAiCompatibleProvider({ apiKey: 'k', baseUrl: 'https://api.test/v1' }, fetchFn);
    const res = await p.assessPronunciation({ data: Buffer.from('x'), mimeType: 'audio/webm' }, 'cat');
    expect(res.score).toBe(0);
    expect(res.feedback).toContain('不支持发音评测');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('无 apiKey 时 chat 抛 401', async () => {
    const fetchFn = jest.fn();
    const p = new OpenAiCompatibleProvider({ baseUrl: 'https://api.test/v1' }, fetchFn);
    await expect(p.chat([{ role: 'user', content: 'x' }])).rejects.toThrow(/未配置/);
  });

  it('extraBody 合并进 chat 请求体（如 chat_template_kwargs/enable_thinking）', async () => {
    const fetchFn = jest.fn(
      async (_url: string, init: RequestInit): Promise<Response> =>
        jsonResponse({ model: 'agnes', choices: [{ message: { content: 'ok' } }] }),
    );
    const p = new OpenAiCompatibleProvider(
      {
        apiKey: 'k',
        baseUrl: 'https://api.agnes-ai.cn/v1',
        model: 'agnes-2.5-flash',
        extraBody: { chat_template_kwargs: { enable_thinking: true } },
      },
      fetchFn,
    );
    await p.chat([{ role: 'user', content: 'hi' }]);
    const body = JSON.parse(fetchFn.mock.calls[0][1].body as string);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: true });
    expect(body.model).toBe('agnes-2.5-flash');
  });

  it('options.extraBody 覆盖种子 extraBody（调用层优先），并捕获 finish_reason', async () => {
    const fetchFn = jest.fn(
      async (_url: string, _init: RequestInit): Promise<Response> =>
        jsonResponse({
          model: 'agnes',
          choices: [{ message: { content: 'ok' }, finish_reason: 'length' }],
        }),
    );
    const p = new OpenAiCompatibleProvider(
      {
        apiKey: 'k',
        baseUrl: 'https://api.agnes-ai.cn/v1',
        model: 'agnes-2.5-flash',
        extraBody: { chat_template_kwargs: { enable_thinking: true } },
      },
      fetchFn,
    );
    const res = await p.chat(
      [{ role: 'user', content: 'hi' }],
      { extraBody: { chat_template_kwargs: { enable_thinking: false } } },
    );
    const body = JSON.parse(fetchFn.mock.calls[0][1].body as string);
    // 调用层 extraBody 覆盖种子 extraBody（浅合并，嵌套对象整体覆盖）。
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    // finish_reason 透传，供业务层判断是否被 max_tokens 截断。
    expect(res.finishReason).toBe('length');
  });

  it('AI-714: capabilities 非空且未声明 tts → synthesize 抛 UnsupportedMethodError', async () => {
    const fetchFn = jest.fn();
    const p = new OpenAiCompatibleProvider(
      { apiKey: 'k', baseUrl: 'https://api.test/v1', model: 'gpt-4o-mini', capabilities: ['chat'] },
      fetchFn,
    );
    await expect(p.synthesize('hi')).rejects.toBeInstanceOf(UnsupportedMethodError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('AI-714: capabilities 包含 tts → synthesize 正常请求', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchFn = jest.fn(
      async () => new Response(bytes, { status: 200, headers: { 'content-type': 'audio/mpeg' } }),
    );
    const p = new OpenAiCompatibleProvider(
      { apiKey: 'k', baseUrl: 'https://api.test/v1', model: 'tts-1', capabilities: ['tts'] },
      fetchFn,
    );
    const res = await p.synthesize('hi');
    expect(res.mimeType).toBe('audio/mpeg');
    // 请求体 model 用单一 model 字段
    const mockCall = (fetchFn as jest.Mock).mock.calls[0];
    expect(JSON.parse(mockCall[1].body as string).model).toBe('tts-1');
  });

  it('AI-714: capabilities 为空/undefined → 视为全能力（不抛 UnsupportedMethodError）', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchFn = jest.fn(
      async () => new Response(bytes, { status: 200, headers: { 'content-type': 'audio/mpeg' } }),
    );
    const p = new OpenAiCompatibleProvider(
      { apiKey: 'k', baseUrl: 'https://api.test/v1', model: 'tts-1' },
      fetchFn,
    );
    const res = await p.synthesize('hi');
    expect(res.mimeType).toBe('audio/mpeg');
  });
});
