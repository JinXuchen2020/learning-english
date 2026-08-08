/**
 * 吉祥物等级计算（AI-603，前端纯逻辑）。
 *
 * 与后端 `server/src/ai/mascot-level.util.ts` 同口径（computeLevel / buildLevelInfo / 阈值）。
 * 单一真相：等级由累计星星 totalStars 推导，前端仅用于展示，不持久化。
 */

/** 各等级累计星星下限（索引 i → 等级 i+1 所需最低星星）。 */
export const LEVEL_THRESHOLDS = [0, 50, 120, 200, 300, 500];

/** 最高等级（等于阈值数组长度）。 */
export const MAX_LEVEL = LEVEL_THRESHOLDS.length;

/** 由累计星星推导等级（1..MAX_LEVEL）。 */
export function computeLevel(totalStars: number): number {
  if (!Number.isFinite(totalStars) || totalStars < 0) return 1;
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalStars >= LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return level;
}

/** 等级进度信息（驱动前端等级环）。 */
export interface MascotLevelInfo {
  level: number;
  totalStars: number;
  levelStars: number;
  nextLevelStars: number;
  isMaxLevel: boolean;
}

/** 由 totalStars 与（可选）已知 level 构建等级进度信息。 */
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
