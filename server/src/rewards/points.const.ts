/**
 * 积分累加规则（AI-701）。
 *
 * 统一由 `RewardsService.awardStars(userId, n)` 消费，n 取自此处，避免散落各处。
 * 数值为「每次获得行为 +n 积分（同时 +n 累计星星驱动等级）」。
 */
export const POINT_RULES = {
  /** 完成课程（沿用 AI-603 的 +1 星）。 */
  LESSON_COMPLETE: 1,
  /** 完成每日任务。 */
  TASK_COMPLETE: 1,
  /** 单词答对一次。 */
  WORD_CORRECT: 1,
  /** 口语评分通过（≥60）。 */
  SPEECH_PASS: 2,
} as const;
