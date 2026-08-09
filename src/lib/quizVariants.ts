// AI-703 — 测验变体纯前端出题 / 判定逻辑。
//
// 三种练习模式共用统一题项结构 `QuizItem`：
//  - "multiple"（看字选词）：沿用后端预计算的 `word.options` 文本 + `correctIndex`。
//  - "listen"（听音选图）：音频优先、隐藏文字，候选为插图词，正确项即目标词。
//  - "combination"（组词）：颜色 + 物品类别组合，候选为插图词，正确项唯一匹配该组合。
//
// 所有"出题"函数接受可注入 `rng`，便于单元测试确定性复现；
// 组词题强制"组合唯一"以避免歧义（详见 generateCombinationQuestions）。
import type { Word } from "./types";

export type QuizMode = "multiple" | "listen" | "combination";

/** 听音选图题。 */
export interface ListenQuestion {
  type: "listen";
  /** 目标词（文字隐藏，靠朗读识别）。 */
  target: Word;
  /** 候选插图词（含目标）。 */
  options: Word[];
  /** 目标词在 options 中的位置。 */
  correctIndex: number;
}

/** 组词题：颜色 + 类别组合。 */
export interface CombinationQuestion {
  type: "combination";
  /** 提示颜色（如 "orange"）。 */
  color: string;
  /** 提示类别（如 "pet"）。 */
  category: string;
  /** 展示短语，如 "orange pet"。 */
  phrase: string;
  /** 候选插图词（含唯一正确项）。 */
  options: Word[];
  correctIndex: number;
}

/** 组件可消费的统一题项。 */
export interface QuizItem {
  /** 本题正确单词（用于 recordWordAttempt 与展示）。 */
  word: Word;
  /** 答案选项：文本或插图词。 */
  options: { kind: "text" | "image"; label?: string; word?: Word }[];
  /** 正确选项索引。 */
  correctIndex: number;
  /** 答案呈现方式。 */
  optionKind: "text" | "image";
  /** 提示词文本（multiple=单词；combination=短语）。listen 隐藏。 */
  promptText?: string;
  /** 是否隐藏提示词文本（listen 音频优先）。 */
  hidePromptText?: boolean;
  /** 组词模式颜色块。 */
  color?: string;
  /** 组词模式类别。 */
  category?: string;
}

export interface GenerateOptions {
  /** 每套题最多题目数（默认 = 全量单词）。 */
  perQuiz?: number;
  /** 可注入随机源（测试确定性；默认 Math.random）。 */
  rng?: () => number;
  /** 每题候选选项数（默认 4）。 */
  optionCount?: number;
}

/** Fisher–Yates 洗牌（返回新数组，不修改入参）。 */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 从 pool 取 count 个 id 不在 excludeIds 中的元素（去重、洗牌、截断）。 */
function pickDistinctWords(
  pool: Word[],
  count: number,
  excludeIds: string[],
  rng: () => number,
): Word[] {
  const candidates = pool.filter((w) => !excludeIds.includes(w.id));
  return shuffle(candidates, rng).slice(0, count);
}

/** 听音选图：每词一题；候选为插图词，正确项即目标词。 */
export function generateListenQuestions(
  words: Word[],
  opts: GenerateOptions = {},
): ListenQuestion[] {
  const { perQuiz, rng = Math.random, optionCount = 4 } = opts;
  const pool = words.filter((w) => !!w && !!w.text);
  // 至少需要 目标 + 1 干扰项
  if (pool.length < 2) return [];

  const effectiveOptionCount = Math.min(optionCount, pool.length);
  const questions: ListenQuestion[] = [];
  const targets = shuffle(pool, rng);
  const limit = perQuiz != null ? Math.min(perQuiz, targets.length) : targets.length;

  for (let i = 0; i < limit; i++) {
    const target = targets[i];
    const distractors = pickDistinctWords(
      pool,
      effectiveOptionCount - 1,
      [target.id],
      rng,
    );
    const options = shuffle([target, ...distractors], rng);
    const correctIndex = options.findIndex((w) => w.id === target.id);
    questions.push({ type: "listen", target, options, correctIndex });
  }
  return questions;
}

/** 组词：仅对 (color,category) 在词池中唯一的单词出题，避免歧义。 */
export function generateCombinationQuestions(
  words: Word[],
  opts: GenerateOptions = {},
): CombinationQuestion[] {
  const { perQuiz, rng = Math.random, optionCount = 4 } = opts;
  // 仅保留同时具备 color + category 的单词
  const pool = words.filter(
    (w) => !!w && !!w.text && !!w.color && !!w.category,
  );
  if (pool.length < 2) return [];

  // 统计每个 (color,category) 出现次数；只有"唯一"组合才能安全出题
  const comboCount = new Map<string, number>();
  for (const w of pool) {
    const key = `${w.color}|${w.category}`;
    comboCount.set(key, (comboCount.get(key) ?? 0) + 1);
  }
  const uniqueTargets = pool.filter(
    (w) => comboCount.get(`${w.color}|${w.category}`) === 1,
  );
  if (uniqueTargets.length < 1) return [];

  const effectiveOptionCount = Math.min(optionCount, pool.length);
  const questions: CombinationQuestion[] = [];
  const targets = shuffle(uniqueTargets, rng);
  const limit = perQuiz != null ? Math.min(perQuiz, targets.length) : targets.length;

  for (let i = 0; i < limit; i++) {
    const target = targets[i];
    const distractors = pickDistinctWords(
      pool,
      effectiveOptionCount - 1,
      [target.id],
      rng,
    );
    const options = shuffle([target, ...distractors], rng);
    const correctIndex = options.findIndex((w) => w.id === target.id);
    questions.push({
      type: "combination",
      color: target.color as string,
      category: target.category as string,
      phrase: `${target.color} ${target.category}`,
      options,
      correctIndex,
    });
  }
  return questions;
}

/** 听音选图判定：命中正确索引返回 true；越界 / 非整数返回 false（防御）。 */
export function judgeListen(
  q: ListenQuestion,
  selectedIndex: number,
): boolean {
  if (
    !Number.isInteger(selectedIndex) ||
    selectedIndex < 0 ||
    selectedIndex >= q.options.length
  ) {
    return false;
  }
  return selectedIndex === q.correctIndex;
}

/** 组词判定：命中正确索引返回 true；越界 / 非整数返回 false（防御）。 */
export function judgeCombination(
  q: CombinationQuestion,
  selectedIndex: number,
): boolean {
  if (
    !Number.isInteger(selectedIndex) ||
    selectedIndex < 0 ||
    selectedIndex >= q.options.length
  ) {
    return false;
  }
  return selectedIndex === q.correctIndex;
}

/**
 * 把单词列表按模式统一为 `QuizItem[]`，供 `Quiz` 组件消费。
 * - multiple：保留后端 `word.options` 文本。
 * - listen：插图选项、隐藏提示文字。
 * - combination：插图选项 + 颜色/类别提示。
 */
export function buildQuizItems(
  words: Word[],
  mode: QuizMode,
  opts: GenerateOptions = {},
): QuizItem[] {
  if (mode === "listen") {
    return generateListenQuestions(words, opts).map((q) => ({
      word: q.target,
      options: q.options.map((w) => ({ kind: "image" as const, word: w })),
      correctIndex: q.correctIndex,
      optionKind: "image",
      hidePromptText: true,
    }));
  }

  if (mode === "combination") {
    return generateCombinationQuestions(words, opts).map((q) => ({
      word: q.options[q.correctIndex],
      options: q.options.map((w) => ({ kind: "image" as const, word: w })),
      correctIndex: q.correctIndex,
      optionKind: "image",
      promptText: q.phrase,
      color: q.color,
      category: q.category,
    }));
  }

  // multiple（看字选词）：沿用后端预计算
  return words.map((w) => ({
    word: w,
    options: w.options.map((label) => ({ kind: "text" as const, label })),
    correctIndex: w.correctIndex,
    optionKind: "text",
    promptText: w.text,
  }));
}
