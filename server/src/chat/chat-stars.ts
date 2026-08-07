/**
 * 对话星标计算（AI-408 纯逻辑，便于单元测试，不依赖 DB）。
 *
 * 规则：每完成 `CHAT_STAR_ROUNDS` 轮（一轮 = 用户发一条言 + 狐狸回一条）即
 * 获得一颗星星；星星数 = floor(rounds / CHAT_STAR_ROUNDS)，可累积（每 8 轮再 +1）。
 * `starAwarded` 表示「本轮是否刚跨过一个新的星星里程碑」（用于前端触发庆祝动画）。
 * `starsUntilNext` = 距下一颗星星还剩几轮。
 */

/** 完成多少轮对话得一颗星星（AI-408 默认 8 轮）。 */
export const CHAT_STAR_ROUNDS = 8;

/** 星标计算结果。 */
export interface StarAward {
  /** 本会话累计星星数（= floor(rounds / CHAT_STAR_ROUNDS)）。 */
  stars: number;
  /** 本轮是否刚跨过新的星星里程碑（触发庆祝）。 */
  starAwarded: boolean;
  /** 距下一颗星星还剩几轮。 */
  starsUntilNext: number;
}

/**
 * 计算星标。
 * @param rounds 本会话已完成的对话轮数（= 用户发言条数）。
 * @param prevStars 会话此前已累计星星数（来自 `AiChatSession.stars`）。
 */
export function computeStars(rounds: number, prevStars: number): StarAward {
  const safeRounds = Math.max(0, Math.floor(rounds));
  const stars = Math.floor(safeRounds / CHAT_STAR_ROUNDS);
  const starAwarded = stars > prevStars;
  const remainder = safeRounds % CHAT_STAR_ROUNDS;
  const starsUntilNext =
    remainder === 0 ? CHAT_STAR_ROUNDS : CHAT_STAR_ROUNDS - remainder;
  return { stars, starAwarded, starsUntilNext };
}
