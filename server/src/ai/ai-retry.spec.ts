import {
  classifyError,
  withRetry,
  normalizeError,
  DEFAULT_RETRY_OPTIONS,
} from './ai-retry';
import { AiProviderException, AiAccessError } from './ai-provider.errors';

describe('classifyError', () => {
  it('treats 429 rate-limit as retryable', () => {
    expect(classifyError(new AiProviderException('x', { statusCode: 429 }))).toBe('retryable');
  });

  it('treats network (0) and timeout (504) as retryable', () => {
    expect(classifyError(new AiProviderException('x', { statusCode: 0, code: 'NETWORK' }))).toBe('retryable');
    expect(classifyError(new AiProviderException('x', { statusCode: 504 }))).toBe('retryable');
  });

  it('treats 5xx gateway errors (except 502) as retryable', () => {
    expect(classifyError(new AiProviderException('x', { statusCode: 500 }))).toBe('retryable');
    expect(classifyError(new AiProviderException('x', { statusCode: 503 }))).toBe('retryable');
  });

  it('treats BigModel structural 502 as permanent (not a transient gateway error)', () => {
    expect(classifyError(new AiProviderException('x', { statusCode: 502 }))).toBe('permanent');
  });

  it('treats other 4xx as permanent', () => {
    expect(classifyError(new AiProviderException('x', { statusCode: 400 }))).toBe('permanent');
    expect(classifyError(new AiProviderException('x', { statusCode: 404 }))).toBe('permanent');
  });

  it('treats 401/403 auth as access', () => {
    expect(classifyError(new AiProviderException('x', { statusCode: 401 }))).toBe('access');
    expect(classifyError(new AiProviderException('x', { statusCode: 403 }))).toBe('access');
  });

  it('treats NVIDIA 404 Function not found for account as access', () => {
    expect(
      classifyError(new AiProviderException('Function not found for account', { statusCode: 404, code: 'FUNCTION_NOT_FOUND' })),
    ).toBe('access');
    expect(
      classifyError(new AiProviderException('Function not found for account: no access', { statusCode: 404 })),
    ).toBe('access');
  });

  it('treats AiAccessError as access', () => {
    expect(classifyError(new AiAccessError('x', { statusCode: 401 }))).toBe('access');
  });

  it('treats unknown non-AiProviderException errors as permanent', () => {
    expect(classifyError(new Error('boom'))).toBe('permanent');
    expect(classifyError('weird')).toBe('permanent');
    expect(classifyError(null)).toBe('permanent');
  });
});

describe('withRetry', () => {
  const noDelay = async () => undefined;

  it('returns on first success without retrying', async () => {
    let calls = 0;
    const res = await withRetry(async () => {
      calls += 1;
      return 'ok';
    }, { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, delay: noDelay });
    expect(res).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries once on a transient error then succeeds', async () => {
    const delays: number[] = [];
    let calls = 0;
    const res = await withRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw new AiProviderException('503', { statusCode: 503 });
        return 'recovered';
      },
      { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, baseDelayMs: 400, factor: 2, delay: async (ms) => { delays.push(ms); } },
    );
    expect(res).toBe('recovered');
    expect(calls).toBe(2);
    expect(delays).toEqual([400]);
  });

  it('applies exponential backoff between retries', async () => {
    const delays: number[] = [];
    let calls = 0;
    await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new AiProviderException('503', { statusCode: 503 });
        return 'ok';
      },
      { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, baseDelayMs: 400, maxDelayMs: 100000, factor: 2, delay: async (ms) => { delays.push(ms); } },
    ).catch(() => undefined);
    expect(delays).toEqual([400, 800]);
  });

  it('throws the last recognizable error after exhausting attempts', async () => {
    let calls = 0;
    let caught: unknown;
    try {
      await withRetry(
        async () => {
          calls += 1;
          throw new AiProviderException('down', { statusCode: 503 });
        },
        { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, delay: noDelay },
      );
    } catch (e) {
      caught = e;
    }
    expect(calls).toBe(3);
    expect(caught).toBeInstanceOf(AiProviderException);
    expect((caught as AiProviderException).statusCode).toBe(503);
  });

  it('does NOT retry access errors (throws immediately)', async () => {
    let calls = 0;
    const delays: number[] = [];
    let caught: unknown;
    try {
      await withRetry(
        async () => {
          calls += 1;
          throw new AiAccessError('forbidden', { statusCode: 403 });
        },
        { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, delay: async (ms) => { delays.push(ms); } },
      );
    } catch (e) {
      caught = e;
    }
    expect(calls).toBe(1);
    expect(delays).toEqual([]);
    expect(caught).toBeInstanceOf(AiAccessError);
  });

  it('does NOT retry permanent errors (throws immediately)', async () => {
    let calls = 0;
    let caught: unknown;
    try {
      await withRetry(
        async () => {
          calls += 1;
          throw new AiProviderException('bad request', { statusCode: 400 });
        },
        { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, delay: noDelay },
      );
    } catch (e) {
      caught = e;
    }
    expect(calls).toBe(1);
    expect(caught).toBeInstanceOf(AiProviderException);
    expect((caught as AiProviderException).statusCode).toBe(400);
  });

  it('honors a custom maxAttempts', async () => {
    let calls = 0;
    try {
      await withRetry(
        async () => {
          calls += 1;
          throw new AiProviderException('x', { statusCode: 0, code: 'NETWORK' });
        },
        { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 2, delay: noDelay },
      );
    } catch {
      // ignore
    }
    expect(calls).toBe(2);
  });
});

describe('normalizeError', () => {
  it('wraps a 401 AiProviderException into AiAccessError', () => {
    const out = normalizeError(new AiProviderException('denied', { statusCode: 401 }));
    expect(out).toBeInstanceOf(AiAccessError);
    expect(out.statusCode).toBe(401);
    expect(out.message).toBe('denied');
  });

  it('returns the same AiAccessError instance unchanged', () => {
    const e = new AiAccessError('x', { statusCode: 403 });
    expect(normalizeError(e)).toBe(e);
  });

  it('returns permanent AiProviderException unchanged', () => {
    const e = new AiProviderException('boom', { statusCode: 500 });
    expect(normalizeError(e)).toBe(e);
  });

  it('wraps a bare Error into AiProviderException', () => {
    const out = normalizeError(new Error('raw'));
    expect(out).toBeInstanceOf(AiProviderException);
    expect(out.message).toContain('raw');
  });
});
