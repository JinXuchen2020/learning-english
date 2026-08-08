import type { WordCard, WordCardStatus } from "./types";

/**
 * 单词卡纯逻辑模块（AI-601，前端可单测、不含 React / 副作用）。
 *
 * 仅封装「按状态过滤」「按状态计数」两个无副作用函数，供 `/word-cards` 页渲染
 * 与 vitest 单测使用。后端强约束见 `server/src/word-card/*`。
 */

/**
 * 按审核状态过滤卡片。
 * @param cards 全部卡片
 * @param status 目标状态；`null`/`undefined` → 返回全部
 */
export function filterWordCards(
  cards: WordCard[],
  status?: WordCardStatus | null,
): WordCard[] {
  if (!status) return cards;
  return cards.filter((c) => c.status === status);
}

/**
 * 统计各审核状态卡片数量。
 * @returns `{ pending, approved, rejected }`，缺省计 0
 */
export function countByStatus(cards: WordCard[]): Record<WordCardStatus, number> {
  const counts: Record<WordCardStatus, number> = { pending: 0, approved: 0, rejected: 0 };
  for (const c of cards) {
    if (c.status in counts) counts[c.status] += 1;
  }
  return counts;
}
