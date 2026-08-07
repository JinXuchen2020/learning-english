/**
 * 家长周报日期纯逻辑（AI-507）。
 *
 * 与后端 `weekly-report.service.ts` 的 `weekStartOf` / `addDays` 保持同一 UTC 口径
 * （YYYY-MM-DD 一律按 UTC 零点解析，避免浏览器本地时区漂移导致「周起始」错位）。
 *
 * 这些纯函数被 Dashboard 的周初值计算与 prev/next 周导航复用，并集中在此便于
 * Vitest 在 node 环境单测（不依赖浏览器 API，无副作用）。
 */

/** 返回 `date` 所在周的 Monday（ISO 周起始）YYYY-MM-DD（UTC 口径）。 */
export function mondayOfWeekUTC(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // Monday=0
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().split("T")[0];
}

/** 给定 YYYY-MM-DD 加减 n 天（UTC），返回 YYYY-MM-DD。 */
export function addDaysUTC(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

/** 周结束日（Sunday）= 周起始 + 6 天。 */
export function weekEndOf(weekStart: string): string {
  return addDaysUTC(weekStart, 6);
}

/** 返回 UTC 当日 YYYY-MM-DD（供 Dashboard 初值）。 */
export function todayUtc(): string {
  return new Date().toISOString().split("T")[0];
}
