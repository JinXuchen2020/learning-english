import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getStoredUser,
  getToken,
  setStoredUser,
  setToken,
} from "./api";

/**
 * Verifies the session-persistence helpers used to keep a user logged in
 * across a hard refresh (fixes "refresh returns to /login").
 *
 * `api.ts` guards storage behind `typeof window`, so we provide a minimal
 * `window.localStorage` mock for the node test environment.
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
    _dump: () => Object.fromEntries(map),
  };
}

describe("session persistence (localStorage)", () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
    vi.stubGlobal("window", { localStorage: storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setToken(null);
    setStoredUser(null);
  });

  it("setToken/getToken round-trips and mirrors to localStorage", () => {
    setToken("tok-123");
    expect(getToken()).toBe("tok-123");
    expect(storage.getItem("le_auth_token")).toBe("tok-123");
  });

  it("getToken falls back to localStorage when module memory is empty", () => {
    // Simulate a fresh module load: write only to storage.
    storage.setItem("le_auth_token", "from-storage");
    // Module-level `accessToken` starts null in this test process, so the
    // `?? storageGet` fallback path must supply the persisted value.
    expect(getToken()).toBe("from-storage");
  });

  it("setToken(null) clears both memory and storage", () => {
    setToken("tok-123");
    setToken(null);
    expect(getToken()).toBeNull();
    expect(storage.getItem("le_auth_token")).toBeNull();
  });

  it("setStoredUser/getStoredUser round-trips the user object", () => {
    const user = {
      id: "u1",
      username: "kid",
      nickname: "小狐狸",
      totalStars: 12,
      streakDays: 3,
      role: "child" as const,
    };
    setStoredUser(user);
    expect(getStoredUser()).toEqual(user);
    expect(storage.getItem("le_auth_user")).toBe(JSON.stringify(user));
  });

  it("setStoredUser(null) clears storage", () => {
    setStoredUser({
      id: "u1",
      username: "kid",
      nickname: "小狐狸",
      totalStars: 0,
      streakDays: 0,
      role: "child",
    });
    setStoredUser(null);
    expect(getStoredUser()).toBeNull();
    expect(storage.getItem("le_auth_user")).toBeNull();
  });

  it("getStoredUser returns null on corrupt JSON", () => {
    storage.setItem("le_auth_user", "{not-json");
    expect(getStoredUser()).toBeNull();
  });
});
