import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  evaluateSpeech,
  getStoredUser,
  getToken,
  listScannedWords,
  login,
  setStoredUser,
  setToken,
} from "./api";

/**
 * 401 会话失效统一处理（「token 调 API 返回 401 需要重新登录」）：
 *  - 携带 token 的请求被服务端判为未认证（401）→ 清除本地过期会话并跳转登录页；
 *  - 登录/注册接口自身的 401（凭据错误）不清会话、不跳转；
 *  - 已在登录页时不重复跳转，避免循环。
 *
 * 与 api-auth-persist.spec.ts 同套路：node 环境手工提供 window.localStorage /
 * window.location 桩，fetch 用最小 Response 桩。
 */
function createMockStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

function stubBrowser(pathname: string) {
  const storage = createMockStorage();
  const assign = vi.fn();
  vi.stubGlobal("window", {
    localStorage: storage,
    location: { pathname, assign },
  });
  return { storage, assign };
}

function mockFetchOnce(status: number, body: unknown = {}) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const demoUser = {
  id: "u1",
  username: "kid",
  nickname: "Kid",
  totalStars: 0,
  streakDays: 0,
  role: "child" as const,
};

describe("api 401 session expiry handling", () => {
  beforeEach(() => {
    setToken(null);
    setStoredUser(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setToken(null);
    setStoredUser(null);
  });

  it("带 token 的请求返回 401 → 清除本地会话并跳转 /zh/login", async () => {
    const { storage, assign } = stubBrowser("/zh/course");
    setToken("expired-token");
    setStoredUser(demoUser);
    mockFetchOnce(401, { message: "Unauthorized" });

    await expect(listScannedWords()).rejects.toBeInstanceOf(ApiError);

    expect(getToken()).toBeNull();
    expect(storage.getItem("le_auth_token")).toBeNull();
    expect(storage.getItem("le_auth_user")).toBeNull();
    expect(getStoredUser()).toBeNull();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/zh/login");
  });

  it("en 路径下 401 跳转 /en/login", async () => {
    const { assign } = stubBrowser("/en/practice");
    setToken("expired-token");
    mockFetchOnce(401);

    await expect(listScannedWords()).rejects.toBeInstanceOf(ApiError);

    expect(assign).toHaveBeenCalledWith("/en/login");
  });

  it("已在登录页时 401 只清会话、不重复跳转（防循环）", async () => {
    const { assign } = stubBrowser("/zh/login");
    setToken("expired-token");
    mockFetchOnce(401);

    await expect(listScannedWords()).rejects.toBeInstanceOf(ApiError);

    expect(getToken()).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it("登录接口的 401（凭据错误）不清会话、不跳转", async () => {
    const { assign } = stubBrowser("/zh/login");
    setToken("existing-token"); // 模拟残留的旧会话
    mockFetchOnce(401, { message: "用户名或密码错误" });

    await expect(login("u", "wrong")).rejects.toBeInstanceOf(ApiError);

    // auth=false 的请求不触发会话失效处理：旧 token 原样保留，无跳转
    expect(getToken()).toBe("existing-token");
    expect(assign).not.toHaveBeenCalled();
  });

  it("multipart 上传（evaluateSpeech）401 同样清会话并跳转", async () => {
    const { assign } = stubBrowser("/zh/speak");
    setToken("expired-token");
    mockFetchOnce(401);

    await expect(evaluateSpeech(new Blob(["audio"]))).rejects.toBeInstanceOf(
      ApiError
    );

    expect(getToken()).toBeNull();
    expect(assign).toHaveBeenCalledWith("/zh/login");
  });
});
