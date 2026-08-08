/**
 * 吉祥物等级计算（AI-603）。
 *
 * 纯函数，前后端同口径（前端 `src/lib/mascotLevel.ts` 复刻本文件逻辑）。
 * 等级由累计星星 `totalStars` 推导：阈值数组索引即等级-1，超出末档封顶。
 * 单一真相来源，避免 `User.level` 与 `totalStars` 不一致。
 */

/** 各等级累计星星下限（索引 i → 等级 i+1 所需最低星星）。末档之上封顶为 MAX_LEVEL。 */
export const LEVEL_THRESHOLDS = [0, 50, 120, 200, 300, 500];

/** 最高等级（等于阈值数组长度）。 */
export const MAX_LEVEL = LEVEL_THRESHOLDS.length;

/**
 * 由累计星星推导等级（1..MAX_LEVEL）。
 * 负数 / 非有限值 → 1。
 */
export function computeLevel(totalStars: number): number {
  if (!Number.isFinite(totalStars) || totalStars < 0) return 1;
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalStars >= LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return level;
}

/** 等级进度信息（驱动前端等级环与配饰）。 */
export interface MascotLevelInfo {
  /** 当前等级（1..MAX_LEVEL）。 */
  level: number;
  /** 累计星星。 */
  totalStars: number;
  /** 当前级已得星（totalStars - 本级下限）。 */
  levelStars: number;
  /** 升下一级所需累计星星（封顶时等于 totalStars）。 */
  nextLevelStars: number;
  /** 是否已满级。 */
  isMaxLevel: boolean;
}

/**
 * 由 totalStars 与（可选）已知 level 构建等级进度信息。
 * 已知 level 优先（来自持久化字段），否则从 totalStars 推导，保证后端/前端/DB 一致。
 */
export function buildLevelInfo(totalStars: number, level?: number): MascotLevelInfo {
  const lv = level ?? computeLevel(totalStars);
  const lower = LEVEL_THRESHOLDS[lv - 1] ?? 0;
  const upper = lv < LEVEL_THRESHOLDS.length ? LEVEL_THRESHOLDS[lv] : null;
  const levelStars = Math.max(0, totalStars - lower);
  const nextLevelStars = upper ?? totalStars;
  return {
    level: lv,
    totalStars,
    levelStars,
    nextLevelStars,
    isMaxLevel: upper === null,
  };
}
