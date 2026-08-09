/**
 * AI-704 逾期 / 补学循环 — 补学队列纯计算函数。
 *
 * 补学队列是「昨日」学习状态的实时视图，由现有 `word_progress` 与
 * `study_plan_days` 计算，不经过新实体。纯函数便于单测覆盖所有分支
 * （昨日/今日/未来边界、掌握度阈值、与 AI-605 到期复习去重）。
 */

/** 补学「未掌握」阈值：掌握度 < 60 视为需补学（与 AI-503 弱项口径 <0.6 对齐）。 */
export const MAKEUP_MASTERY_THRESHOLD = 60;

/** 单条补学弱词项。 */
export interface MakeupWordItem {
  wordId: string;
  wordText: string;
  meaning: string;
  /** 当前掌握度 0-100。 */
  mastery: number;
  /** 上次练习时间 ISO 字符串。 */
  lastPracticedAt: string;
}

/** 单条补学未完成计划日项。 */
export interface MakeupTaskItem {
  planDayId: string;
  title: string;
  /** 计划日日期 YYYY-MM-DD（UTC）。 */
  date: string;
}

/** 补学队列聚合响应。 */
export interface MakeupQueue {
  weakWords: MakeupWordItem[];
  missedTasks: MakeupTaskItem[];
}

/** 给定 Date 返回 UTC `YYYY-MM-DD`。与 `task_completions.date` / `study_plan_days.date` 口径一致。 */
export function toUtcDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

/**
 * 判断 `date` 是否落在 `today` 的前一天（UTC 整天）。
 * 空值 / 非法值 / 今天 / 未来 → false。
 */
export function isYesterday(
  date: Date | string | null | undefined,
  today: Date,
): boolean {
  if (!date) return false;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return false;
  const todayStr = toUtcDate(today);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const dStr = toUtcDate(d);
  return dStr === toUtcDate(yesterday) && dStr !== todayStr;
}

/** 供 DB 查询的「昨日」日期边界（[起始, 结束)，UTC 口径，含昨日全天、排除今日 00:00）。 */
export function yesterdayBounds(today: Date): [Date, Date] {
  const start = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return [start, end];
}

/** 弱词原始行（来自 `word_progress` LEFT JOIN word）。 */
export interface WeakWordRow {
  wordId: string;
  wordText?: string | null;
  meaning?: string | null;
  mastery: number;
  lastPracticedAt?: Date | string | null;
}

/**
 * 从原始词进度行中筛出「昨日未掌握」弱词，并按掌握度升序。
 * 排除：mastery >= 阈值、非昨日、已出现在 AI-605 到期复习（去重不重复展示）。
 */
export function filterWeakWords(
  rows: WeakWordRow[],
  dueWordIds: Set<string>,
  opts: { threshold?: number; today?: Date } = {},
): MakeupWordItem[] {
  const threshold = opts.threshold ?? MAKEUP_MASTERY_THRESHOLD;
  const today = opts.today ?? new Date();
  return rows
    .filter((r) => r.mastery < threshold)
    .filter((r) => isYesterday(r.lastPracticedAt, today))
    .filter((r) => !dueWordIds.has(r.wordId))
    .sort((a, b) => a.mastery - b.mastery)
    .map((r) => ({
      wordId: r.wordId,
      wordText: r.wordText ?? '',
      meaning: r.meaning ?? '',
      mastery: r.mastery,
      lastPracticedAt: r.lastPracticedAt
        ? new Date(r.lastPracticedAt as string | Date).toISOString()
        : '',
    }));
}

/** 未完成计划日原始行（来自 `study_plan_days`）。 */
export interface MissedTaskRow {
  id: string;
  title: string;
  date: string | null;
}

/** 把计划日行映射为补学未完成项。 */
export function mapMissedTasks(rows: MissedTaskRow[]): MakeupTaskItem[] {
  return rows.map((r) => ({
    planDayId: r.id,
    title: r.title,
    date: r.date ?? '',
  }));
}
