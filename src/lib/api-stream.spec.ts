import { describe, it, expect, vi, beforeEach } from "vitest";
import * as api from "./api";
import type { PlanStreamEvent, GeneratePlanDto } from "./types";

const enc = new TextEncoder();

const dto: GeneratePlanDto = {
  childId: "u1",
  ageRange: "6-8",
  level: "a1",
  dailyMinutes: 15,
  interests: ["animals"],
  weeks: 2,
};

/** 将事件数组编码为 SSE 文本（`data: <json>\n\n` 帧）。 */
function sseText(events: PlanStreamEvent[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
}

/** 用给定 SSE 文本构造一个真实 Response（带 ReadableStream body）。 */
function sseResponse(text: string, opts: { status?: number; splitChunks?: boolean } = {}): Response {
  const chunks = opts.splitChunks
    ? // 故意按字节切碎，验证跨 chunk 帧边界解析
      Array.from(enc.encode(text)).map((b) => new Uint8Array([b]))
    : [enc.encode(text)];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  return new Response(stream, {
    status: opts.status ?? 200,
    headers: { "content-type": "text/event-stream" },
  });
}

/** abort 时使流下一读抛出 AbortError（模拟 undici 的 fetch signal 行为）。 */
function abortableSseResponse(text: string, signal?: AbortSignal): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode(text));
      if (signal) {
        signal.addEventListener("abort", () => {
          try {
            controller.error(new DOMException("Aborted", "AbortError"));
          } catch {
            /* already errored */
          }
        });
      }
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  api.setToken(null);
});

describe("consumeSse (AI-804 SSE parser)", () => {
  it("parses multiple events delivered in a single chunk", async () => {
    const events: PlanStreamEvent[] = [];
    const body = sseResponse(
      sseText([
        { type: "start" },
        { type: "token", text: "Hello" },
        { type: "done", plan: { weeks: [] }, model: "ai" },
      ]),
    ).body as ReadableStream<Uint8Array>;
    await api.consumeSse(body, (e) => events.push(e));
    expect(events).toEqual([
      { type: "start" },
      { type: "token", text: "Hello" },
      { type: "done", plan: { weeks: [] }, model: "ai" },
    ]);
  });

  it("handles frames split across multiple chunks", async () => {
    const events: PlanStreamEvent[] = [];
    const body = sseResponse(
      sseText([
        { type: "token", text: "a" },
        { type: "token", text: "b" },
        { type: "done", plan: { weeks: [] }, model: "ai" },
      ]),
      { splitChunks: true },
    ).body as ReadableStream<Uint8Array>;
    await api.consumeSse(body, (e) => events.push(e));
    expect(events.map((e) => e.type)).toEqual(["token", "token", "done"]);
    expect(events[0]).toEqual({ type: "token", text: "a" });
  });

  it("ignores non-JSON / heartbeat control lines", async () => {
    const events: PlanStreamEvent[] = [];
    const mixed = `: heartbeat\n\n${sseText([{ type: "token", text: "x" }])}data: not-json\n\n`;
    const body = sseResponse(mixed).body as ReadableStream<Uint8Array>;
    await api.consumeSse(body, (e) => events.push(e));
    expect(events).toEqual([{ type: "token", text: "x" }]);
  });
});

describe("generatePlanStream (AI-804)", () => {
  it("emits start → token(s) → done in order and stops streaming", async () => {
    const events: PlanStreamEvent[] = [];
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse(
        sseText([
          { type: "start" },
          { type: "token", text: "Plan " },
          { type: "token", text: "for you" },
          { type: "done", plan: { weeks: [{ week: 1, days: [] }] }, model: "ai" },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.generatePlanStream(dto, (e) => events.push(e));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/ai/plan/generate/stream");
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    expect(events.map((e) => e.type)).toEqual(["start", "token", "token", "done"]);
    const done = events[3] as Extract<PlanStreamEvent, { type: "done" }>;
    expect(done.plan.weeks?.[0]?.week).toBe(1);
  });

  it("emits an error event (not a throw) on a structured error frame", async () => {
    const events: PlanStreamEvent[] = [];
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse(
        sseText([
          { type: "start" },
          { type: "token", text: "{" },
          { type: "error", code: "PLAN_INVALID_JSON", message: "bad json" },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    // 不应拒绝（错误走事件通道）
    await expect(
      api.generatePlanStream(dto, (e) => events.push(e)),
    ).resolves.toBeUndefined();
    expect(events.map((e) => e.type)).toEqual(["start", "token", "error"]);
    expect(events[2]).toMatchObject({ type: "error", code: "PLAN_INVALID_JSON" });
  });

  it("emits an error event when the response is not ok", async () => {
    const events: PlanStreamEvent[] = [];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "childId should not be empty" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.generatePlanStream(dto, (e) => events.push(e));
    expect(events).toEqual([
      { type: "error", code: "AI_ERROR", message: "childId should not be empty" },
    ]);
  });

  it("falls back to the non-stream endpoint when body is unavailable", async () => {
    const events: PlanStreamEvent[] = [];
    const fetchMock = vi.fn((url: string | URL) => {
      const u = String(url);
      if (u.includes("/generate/stream")) {
        // 无 body → 退化
        return Promise.resolve({ ok: true, status: 200, body: undefined });
      }
      // 非流式端点返回完整计划
      return Promise.resolve(
        new Response(JSON.stringify({ plan: { weeks: [] }, model: "tpl", degraded: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.generatePlanStream(dto, (e) => events.push(e));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events.map((e) => e.type)).toEqual(["start", "done"]);
    const done = events[1] as Extract<PlanStreamEvent, { type: "done" }>;
    expect(done.plan).toEqual({ weeks: [] });
  });

  it("aborts mid-stream without emitting an error event", async () => {
    const ac = new AbortController();
    const events: PlanStreamEvent[] = [];
    const fetchMock = vi.fn((_url: string | URL, init?: RequestInit) =>
      Promise.resolve(abortableSseResponse(sseText([{ type: "token", text: "partial" }]), init?.signal ?? undefined)),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = api.generatePlanStream(dto, (e) => events.push(e), ac.signal);
    // 给消费端一拍读取首个 chunk
    await new Promise((r) => setTimeout(r, 20));
    ac.abort();
    await promise;

    expect(events).toEqual([{ type: "token", text: "partial" }]);
    // 无 error 事件
    expect(events.some((e) => e.type === "error")).toBe(false);
  });
});
