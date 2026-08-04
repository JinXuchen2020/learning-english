import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger';

const tick = () => new Promise((r) => setTimeout(r, 20));

describe('frontend logger', () => {
  const originalWindow = (globalThis as Record<string, unknown>).window;
  const originalFetch = (globalThis as Record<string, unknown>).fetch;

  afterEach(() => {
    (globalThis as Record<string, unknown>).window = originalWindow;
    (globalThis as Record<string, unknown>).fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('does NOT forward when there is no window (SSR)', async () => {
    (globalThis as Record<string, unknown>).window = undefined;
    const fetchMock = vi.fn();
    (globalThis as Record<string, unknown>).fetch = fetchMock;
    logger.error('boom');
    await tick();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards errors to POST /api/log in the browser', async () => {
    (globalThis as Record<string, unknown>).window = {};
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    (globalThis as Record<string, unknown>).fetch = fetchMock;

    logger.error('boom', { code: 1 });
    await tick();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/log');
    expect(init.method).toBe('POST');
    const sent = JSON.parse(init.body as string);
    expect(sent.level).toBe('error');
    expect(sent.message).toBe('boom');
    expect(sent.meta).toEqual({ code: 1 });
  });

  it('never throws when the forward fails (best-effort)', async () => {
    (globalThis as Record<string, unknown>).window = {};
    const fetchMock = vi.fn().mockRejectedValue(new Error('net down'));
    (globalThis as Record<string, unknown>).fetch = fetchMock;

    expect(() => logger.warn('oops')).not.toThrow();
    await tick();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('mirrors to the matching console level', async () => {
    (globalThis as Record<string, unknown>).window = undefined; // skip forward
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    logger.error('e');
    logger.warn('w');
    logger.info('i');
    logger.debug('d');
    await tick();

    expect(errSpy).toHaveBeenCalledWith('e', undefined);
    expect(warnSpy).toHaveBeenCalledWith('w', undefined);
    expect(logSpy).toHaveBeenCalledWith('i', undefined);
    expect(debugSpy).toHaveBeenCalledWith('d', undefined);
  });
});
