import { NvidiaSafetyClassifier, FetchFn } from './chat-safety.classifier';

/** 构造假 fetch：按给定 ok/status/content 返回，或抛错。 */
function fakeFetch(opts: {
  ok?: boolean;
  status?: number;
  content?: string;
  throwErr?: Error;
}): FetchFn {
  return async () => {
    if (opts.throwErr) throw opts.throwErr;
    return {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      statusText: 'OK',
      json: async () => ({
        choices: [{ message: { content: opts.content ?? 'safe' } }],
      }),
    };
  };
}

describe('NvidiaSafetyClassifier (AI-406)', () => {
  it('响应含 "safe" → 分类为安全（true）', async () => {
    const c = new NvidiaSafetyClassifier(
      { apiKey: 'k', baseUrl: 'https://x/v1', model: 'm/nemoguard' },
      fakeFetch({ content: 'safe' }),
    );
    expect(await c.classify('hello fox')).toBe(true);
  });

  it('响应含 "unsafe" → 分类为不安全（false）', async () => {
    const c = new NvidiaSafetyClassifier(
      { apiKey: 'k', baseUrl: 'https://x/v1', model: 'm/nemoguard' },
      fakeFetch({ content: 'unsafe' }),
    );
    expect(await c.classify('some harmful text')).toBe(false);
  });

  it('未配置 NVIDIA_API_KEY → fail-open 放行（true）', async () => {
    const c = new NvidiaSafetyClassifier({}, fakeFetch({ content: 'unsafe' }));
    expect(await c.classify('anything')).toBe(true);
  });

  it('HTTP 非 2xx → fail-open 放行（true）', async () => {
    const c = new NvidiaSafetyClassifier(
      { apiKey: 'k' },
      fakeFetch({ ok: false, status: 500, content: 'unsafe' }),
    );
    expect(await c.classify('anything')).toBe(true);
  });

  it('fetch 抛错（网络/超时）→ fail-open 放行（true）', async () => {
    const c = new NvidiaSafetyClassifier(
      { apiKey: 'k' },
      fakeFetch({ throwErr: new Error('network down') }),
    );
    expect(await c.classify('anything')).toBe(true);
  });

  it('响应结构异常（无 choices）→ fail-open 放行（true）', async () => {
    const broken: FetchFn = async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ nope: true }),
    });
    const c = new NvidiaSafetyClassifier({ apiKey: 'k' }, broken);
    expect(await c.classify('anything')).toBe(true);
  });
});
