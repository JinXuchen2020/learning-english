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

describe('api.savePlan / api.applyPlan (AI-208)', () => {
  afterEach(() => vi.restoreAllMocks());

  const saveDto = {
    childId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    plan: { weeks: [{ week: 1, days: [{ day: 1, title: '颜色' }] }] },
  };
  const planId = 'a1b2c3d4-0000-0000-0000-000000000001';

  it('savePlan POSTs to /ai/plan/save and returns {id,status}', async () => {
    mockFetch(JSON.stringify({ id: planId, status: 'draft' }), true, 200);
    const res = await api.savePlan(saveDto);
    expect(res).toEqual({ id: planId, status: 'draft' });
    const fetchFn = (globalThis as Record<string, unknown>).fetch as ReturnType<typeof vi.fn>;
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:4000/api/ai/plan/save',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('savePlan throws ApiError on 400 (invalid plan structure)', async () => {
    mockFetch(JSON.stringify({ message: '计划结构不合法，无法保存' }), false, 400);
    await expect(api.savePlan(saveDto)).rejects.toThrow(ApiError);
    await expect(api.savePlan(saveDto)).rejects.toThrow(/计划结构不合法/);
  });

  it('applyPlan POSTs to /ai/plan/:id/apply and returns the apply result', async () => {
    const body = {
      id: planId,
      status: 'applied',
      appliedDays: 2,
      tasksCreated: 8,
      appliedAt: '2026-08-05',
    };
    mockFetch(JSON.stringify(body), true, 200);
    const res = await api.applyPlan(planId, {});
    expect(res).toEqual(body);
    const fetchFn = (globalThis as Record<string, unknown>).fetch as ReturnType<typeof vi.fn>;
    expect(fetchFn).toHaveBeenCalledWith(
      `http://localhost:4000/api/ai/plan/${planId}/apply`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('applyPlan throws ApiError on 409 (already applied, needs confirm)', async () => {
    mockFetch(
      JSON.stringify({ code: 'PLAN_ALREADY_APPLIED', message: '该计划已应用' }),
      false,
      409
    );
    await expect(api.applyPlan(planId, {})).rejects.toThrow(ApiError);
    await expect(api.applyPlan(planId, {})).rejects.toThrow(/已应用/);
  });
});

describe('api.getPlanStatus (AI-209)', () => {
  afterEach(() => vi.restoreAllMocks());

  const childId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

  it('GETs /ai/plan/status?childId= and returns the plan status', async () => {
    const body = {
      hasPlan: true,
      totalDays: 7,
      doneDays: 2,
      completionRatio: 2 / 7,
      planId: 'plan-1',
      appliedAt: '2026-08-05',
    };
    mockFetch(JSON.stringify(body), true, 200);

    const res = await api.getPlanStatus(childId);
    expect(res).toEqual(body);
    const fetchFn = (globalThis as Record<string, unknown>).fetch as ReturnType<typeof vi.fn>;
    expect(fetchFn).toHaveBeenCalledWith(
      `http://localhost:4000/api/ai/plan/status?childId=${childId}`,
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' } })
    );
  });

  it('returns hasPlan:false when no applied plan', async () => {
    mockFetch(
      JSON.stringify({ hasPlan: false, totalDays: 0, doneDays: 0, completionRatio: 0 }),
      true,
      200
    );
    const res = await api.getPlanStatus(childId);
    expect(res.hasPlan).toBe(false);
    expect(res.totalDays).toBe(0);
    expect(res.completionRatio).toBe(0);
  });
});

describe('api.getSentences (AI-309)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('GETs /sentences with no query when no filter provided', async () => {
    mockFetch(JSON.stringify([]), true, 200);
    const res = await api.getSentences();
    expect(res).toEqual([]);
    const fetchFn = (globalThis as Record<string, unknown>).fetch as ReturnType<typeof vi.fn>;
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:4000/api/sentences',
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' } })
    );
  });

  it('appends level and wordText query params when both filters provided', async () => {
    mockFetch(JSON.stringify([]), true, 200);
    await api.getSentences({ level: 'L1', wordText: 'cat' });
    const fetchFn = (globalThis as Record<string, unknown>).fetch as ReturnType<typeof vi.fn>;
    const calledUrl = (fetchFn.mock.calls[0][0] as string);
    expect(calledUrl).toBe('http://localhost:4000/api/sentences?level=L1&wordText=cat');
  });

  it('omits empty filters (no trailing ?)', async () => {
    mockFetch(JSON.stringify([]), true, 200);
    await api.getSentences({ level: '', wordText: '  ' });
    const fetchFn = (globalThis as Record<string, unknown>).fetch as ReturnType<typeof vi.fn>;
    expect(fetchFn.mock.calls[0][0]).toBe('http://localhost:4000/api/sentences');
  });
});

describe('api.getChatScenes / api.sendChatMessage (AI-407)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('GETs /ai/chat/scenes and returns ChatScene[]', async () => {
    const scenes = [
      { id: 'greeting', title: '打招呼', openingLine: 'Hello!', targetVocabulary: ['hi', 'hello'] },
    ];
    mockFetch(JSON.stringify(scenes), true, 200);
    const res = await api.getChatScenes();
    expect(res).toEqual(scenes);
    const fetchFn = (globalThis as Record<string, unknown>).fetch as ReturnType<typeof vi.fn>;
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:4000/api/ai/chat/scenes',
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' } })
    );
  });

  it('POSTs a chat message and returns { sessionId, messageId, replyText, ttsUrl }', async () => {
    const body = {
      sessionId: 'sess-1',
      messageId: 'msg-1',
      replyText: 'Hello! How are you?',
      ttsUrl: 'data:audio/mp3;base64,AAA',
    };
    mockFetch(JSON.stringify(body), true, 200);
    const res = await api.sendChatMessage({ text: 'hi', sceneId: 'greeting' });
    expect(res).toEqual(body);
    const fetchFn = (globalThis as Record<string, unknown>).fetch as ReturnType<typeof vi.fn>;
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:4000/api/ai/chat/messages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'hi', sceneId: 'greeting' }),
      })
    );
  });

  it('throws ApiError on a non-ok chat response', async () => {
    mockFetch(JSON.stringify({ message: 'AI 生成失败，请稍后重试' }), false, 502);
    await expect(api.sendChatMessage({ text: 'hi' })).rejects.toThrow(ApiError);
    await expect(api.sendChatMessage({ text: 'hi' })).rejects.toThrow(/AI 生成失败/);
  });
});
