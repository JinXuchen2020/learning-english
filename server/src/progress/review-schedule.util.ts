/**
 * AI-605 间隔重复（Spaced Repetition / 遗忘曲线）核心算法。
 *
 * 采用 SM-2 简化版：每次练习后根据「是否正确」推进/重置间隔阶梯，
 * 并据此推算下一次复习到期日 `dueDate`。纯函数，便于单测覆盖所有分支。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** 默认间隔阶梯（天）：首次复习→1 天，之后逐步拉长，封顶 60 天。 */
export const DEFAULT_REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30, 60];

/** 易化因子边界（SM-2）。 */
export const EASE_FACTOR_MIN = 1.3;
export const EASE_FACTOR_MAX = 3.0;

/** 单次练习后推导出的复习状态。 */
export interface ReviewState {
  /** 当前间隔天数（下次复习距今天数）。 */
  intervalDays: number;
  /** 更新后的易化因子。 */
  easeFactor: number;
  /** 更新后的连续正确次数（间隔阶梯档位）。 */
  reviewCount: number;
  /** 下一次复习到期日（永远为未来时间）。 */
  dueDate: Date;
}

export interface ComputeReviewInput {
  /** 本次练习是否正确。 */
  correct: boolean;
  /** 上一次间隔天数（缺省 0）。 */
  prevIntervalDays?: number;
  /** 上一次易化因子（缺省 2.5）。 */
  prevEaseFactor?: number;
  /** 上一次连续正确次数（缺省 0）。 */
  prevReviewCount?: number;
  /** 计算基准时间（缺省 now），便于测试注入。 */
  now?: Date;
  /** 间隔阶梯（缺省 DEFAULT_REVIEW_INTERVALS）。 */
  intervals?: number[];
}

/**
 * 从环境变量 `REVIEW_INTERVALS`（逗号分隔整数）读取间隔阶梯；
 * 未配置 / 非法时回退默认阶梯。保证返回非空且均为正整数。
 */
export function loadReviewIntervals(): number[] {
  const raw = process.env.REVIEW_INTERVALS;
  if (!raw) return [...DEFAULT_REVIEW_INTERVALS];
  const parsed = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0 && Number.isInteger(n));
  return parsed.length > 0 ? parsed : [...DEFAULT_REVIEW_INTERVALS];
}

function clampEase(ease: number): number {
  return Math.min(EASE_FACTOR_MAX, Math.max(EASE_FACTOR_MIN, ease));
}

/**
 * 根据本次练习结果推导下一次复习状态。
 *
 * 正确：reviewCount+1；easeFactor 上限 3.0；intervalDays 取阶梯第 (reviewCount-1) 档（越界钳制末档）。
 * 错误：reviewCount 重置 0；easeFactor 下限 1.3；intervalDays 取阶梯首档。
 * dueDate = now + intervalDays 天。
 */
export function computeNextReview(input: ComputeReviewInput): ReviewState {
  const intervals = input.intervals && input.intervals.length > 0
    ? input.intervals
    : DEFAULT_REVIEW_INTERVALS;
  const now = input.now ?? new Date();
  const prevEase = input.prevEaseFactor ?? 2.5;
  const prevCount = input.prevReviewCount ?? 0;

  if (input.correct) {
    const reviewCount = prevCount + 1;
    const easeFactor = clampEase(prevEase + 0.1);
    const idx = Math.min(reviewCount - 1, intervals.length - 1);
    const intervalDays = Math.max(1, intervals[idx] ?? intervals[0]);
    return {
      intervalDays,
      easeFactor,
      reviewCount,
      dueDate: new Date(now.getTime() + intervalDays * DAY_MS),
    };
  }

  // 错误：重置间隔阶梯
  const easeFactor = clampEase(prevEase - 0.2);
  const intervalDays = Math.max(1, intervals[0]);
  return {
    intervalDays,
    easeFactor,
    reviewCount: 0,
    dueDate: new Date(now.getTime() + intervalDays * DAY_MS),
  };
}
