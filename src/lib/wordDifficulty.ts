import type { Word, WordDifficulty, WordDifficultyInfo } from "./types";

/** 一天毫秒数。 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** 掌握度 0-100 = round(correctCount / attempts * 100)；未练返回 0。与后端 `computeMastery` 同口径。 */
export function computeMastery(attempts: number, correctCount: number): number {
  if (!attempts || attempts <= 0) return 0;
  return Math.round((correctCount / attempts) * 100);
}

/** 根据掌握度与练习次数推导难度档位（AI-602）。
 * 需至少 3 次练习才有足够样本调整档位，避免过早升级：
 * - 3+ 次且掌握度 >=80% → hard（正确率高自动升级）
 * - 3+ 次且掌握度 >=50% → medium
 * - 其余（练习 <3 次或掌握度 <50%）→ easy */
export function computeDifficulty(mastery: number, attempts: number): WordDifficulty {
  if (attempts >= 3 && mastery >= 80) return "hard";
  if (attempts >= 3 && mastery >= 50) return "medium";
  return "easy";
}

/** 复习优先级：值越大越需要先复习 = (100 - mastery) + 距上次练习天数 * 5。 */
export function computeReviewPriority(
  mastery: number,
  lastPracticedAtMs?: number | null,
): number {
  let daysSince = 0;
  if (lastPracticedAtMs) {
    daysSince = Math.max(0, Math.floor((Date.now() - lastPracticedAtMs) / DAY_MS));
  } else {
    daysSince = 14;
  }
  return 100 - mastery + daysSince * 5;
}

/**
 * 把单词列表按复习优先级降序排序（弱词/久未练的词在前）。
 * @param words 全量词表
 * @param difficultyMap wordId -> WordDifficultyInfo（来自 getWordDifficulties）
 * 未出现在 map 中的词（未练过）视为最低优先级，保持原相对顺序排在末尾。
 */
export function sortWordsByReviewPriority(
  words: Word[],
  difficultyMap: Map<string, WordDifficultyInfo>,
): Word[] {
  return [...words].sort((a, b) => {
    const pa = difficultyMap.get(a.id)?.reviewPriority ?? -1;
    const pb = difficultyMap.get(b.id)?.reviewPriority ?? -1;
    return pb - pa;
  });
}

/** 统计各难度档位的单词数。 */
export function countByDifficulty(
  infos: WordDifficultyInfo[],
): Record<WordDifficulty, number> {
  const result: Record<WordDifficulty, number> = { easy: 0, medium: 0, hard: 0 };
  for (const info of infos) {
    result[info.difficulty] += 1;
  }
  return result;
}

/** 从 WordDifficultyInfo[] 构建 wordId -> info 的 Map，便于前端排序查表。 */
export function buildDifficultyMap(infos: WordDifficultyInfo[]): Map<string, WordDifficultyInfo> {
  const map = new Map<string, WordDifficultyInfo>();
  for (const info of infos) {
    map.set(info.wordId, info);
  }
  return map;
}
