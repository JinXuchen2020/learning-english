import { API_BASE } from "./api";

export type Level = "error" | "warn" | "info" | "debug";

function mirror(level: Level, args: unknown[]): void {
  if (level === "error") console.error(...args);
  else if (level === "warn") console.warn(...args);
  else if (level === "debug") console.debug(...args);
  else console.log(...args);
}

/**
 * Best-effort forward to the backend log file. The browser cannot write files,
 * so the frontend ships its errors to `POST /api/log` and the NestJS Logger
 * appends them to the SAME `server/logs/app-YYYY-MM-DD.log` as the backend.
 *
 * Guards:
 *  - only runs in the browser (no `window`) and when `fetch` exists
 *  - never throws, and never calls `logger` itself (no recursion)
 */
async function forward(
  level: Level,
  message: string,
  meta?: unknown,
): Promise<void> {
  if (typeof window === "undefined" || typeof fetch !== "function") return;
  try {
    await fetch(`${API_BASE}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, message, meta: meta ?? null }),
    });
  } catch {
    // best-effort: logging must not break the app or recurse into logger
  }
}

export const logger = {
  error(message: string, meta?: unknown): void {
    mirror("error", [message, meta]);
    void forward("error", message, meta);
  },
  warn(message: string, meta?: unknown): void {
    mirror("warn", [message, meta]);
    void forward("warn", message, meta);
  },
  info(message: string, meta?: unknown): void {
    mirror("info", [message, meta]);
    void forward("info", message, meta);
  },
  debug(message: string, meta?: unknown): void {
    mirror("debug", [message, meta]);
    void forward("debug", message, meta);
  },
};
