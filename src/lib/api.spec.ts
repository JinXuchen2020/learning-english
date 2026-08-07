import { describe, it, expect, vi, beforeEach } from "vitest";
import * as api from "./api";
import { ApiError } from "./api";

interface FetchCall {
  url: string | URL;
  init?: RequestInit;
}

/** 注入一个可控的 fetch stub，返回给定 body/status。 */
function mockFetch(body: unknown, status = 200): {
  fetchMock: ReturnType<typeof vi.fn>;
  calls: () => FetchCall[];
} {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === null ? "" : JSON.stringify(body)),
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls: () => fetchMock.mock.calls.map((c) => ({ url: c[0], init: c[1] })) };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  // 重置模块级 token（api.ts 用模块内 let，测试间隔离）
  api.setToken(null);
});

describe("getDailyReport (AI-504)", () => {
  it("POSTs to /api/ai/report/daily with userId only when date omitted", async () => {
    const { fetchMock, calls } = mockFetch({
      userId: "u1",
      date: "2026-08-07",
      summaryText: "今天你超棒！",
      weakWords: [],
      suggestionText: "",
      isDefault: true,
    });
    const res = await api.getDailyReport("u1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/ai/report/daily");
    expect(init?.method).toBe("POST");
    const sent = JSON.parse(String(init?.body));
    expect(sent).toEqual({ userId: "u1" });
    expect(res.summaryText).toBe("今天你超棒！");
    expect(res.isDefault).toBe(true);
    expect(calls().length).toBe(1);
  });

  it("includes the optional date in the request body when provided", async () => {
    const { fetchMock } = mockFetch({
      userId: "u1",
      date: "2026-08-06",
      summaryText: "x",
      weakWords: ["cat"],
      suggestionText: "y",
      isDefault: false,
    });
    await api.getDailyReport("u1", "2026-08-06");

    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(sent).toEqual({ userId: "u1", date: "2026-08-06" });
  });

  it("throws ApiError with status on a 400 response", async () => {
    mockFetch({ message: "userId should not be empty" }, 400);
    await expect(api.getDailyReport("")).rejects.toBeInstanceOf(ApiError);
    try {
      await api.getDailyReport("");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(400);
    }
  });
});
