import { OpenAiCompatibleProvider } from './openai-compatible.provider';

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('OpenAiCompatibleProvider (AI-705)', () => {
  it('chat 构造 /chat/completions 请求并返回文本', async () => {
    const fetchFn = jest.fn(
      async (_url: string, _init: RequestInit): Promise<Response> =>
        jsonResponse({ model: 'gpt-4o-mini', choices: [{ message: { content: 'hi' } }] }),
    );
    const p = new OpenAiCompatibleProvider(
      { apiKey: 'k', baseUrl: 'https://api.test/v1', chatModel: 'gpt-4o-mini' },
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
});
