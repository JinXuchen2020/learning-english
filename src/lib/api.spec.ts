import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import { ApiError } from './api';

function mockFetch(body: string, ok: boolean, status: number) {
  (globalThis as Record<string, unknown>).fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    text: async () => body,
  });
}

describe('api request parsing (any -> typed)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('parses JSON and returns typed data on success', async () => {
    const data = [{ id: 't1', title: 'Task' }];
    mockFetch(JSON.stringify(data), true, 200);
    const tasks = await api.getDailyTasks();
    expect(tasks).toEqual(data);
  });

  it('throws ApiError carrying the server message on non-ok JSON', async () => {
    mockFetch(JSON.stringify({ message: 'bad creds' }), false, 401);
    await expect(api.getDailyTasks()).rejects.toThrow(ApiError);
    await expect(api.getDailyTasks()).rejects.toThrow(/bad creds/);
  });

  it('falls back to a status message when the body is not JSON', async () => {
    mockFetch('Internal Server Error', false, 500);
    await expect(api.getDailyTasks()).rejects.toThrow(/Request failed \(500\)/);
  });
});
