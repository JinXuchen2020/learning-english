import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import { ApiError } from './api';
import type { GeneratePlanResponse } from './types';

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

describe('api.generatePlan (AI-207)', () => {
  afterEach(() => vi.restoreAllMocks());

  const dto = {
    childId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    ageRange: '6-8',
    level: 'a1' as const,
    dailyMinutes: 20,
    interests: ['动物'],
    weeks: 2,
  };

  it('POSTs the dto and returns the plan response on success', async () => {
    const body: GeneratePlanResponse = {
      plan: { weeks: [{ week: 1, days: [{ day: 1, title: '颜色' }] }] },
      model: 'template',
      degraded: true,
    };
    mockFetch(JSON.stringify(body), true, 200);

    const res = await api.generatePlan(dto);
    expect(res).toEqual(body);
    expect(res.degraded).toBe(true);
    const fetchFn = (globalThis as Record<string, unknown>).fetch as ReturnType<typeof vi.fn>;
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:4000/api/ai/plan/generate',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws ApiError when the backend rejects the request', async () => {
    mockFetch(JSON.stringify({ message: 'plan 结构不合法' }), false, 400);
    await expect(api.generatePlan(dto)).rejects.toThrow(ApiError);
    await expect(api.generatePlan(dto)).rejects.toThrow(/plan 结构不合法/);
  });
});
