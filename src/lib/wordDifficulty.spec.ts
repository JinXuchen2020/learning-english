import { describe, it, expect } from "vitest";
import {
  computeMastery,
  computeDifficulty,
  computeReviewPriority,
  sortWordsByReviewPriority,
  countByDifficulty,
  buildDifficultyMap,
} from "./wordDifficulty";
import type { Word, WordDifficultyInfo } from "./types";

function makeWord(id: string): Word {
  return {
    id,
    text: `word-${id}`,
    phonics: "w-urd",
    meaning: "词义",
    illustration: "",
    options: ["a", "b", "c", "d"],
    correctIndex: 0,
  };
}

function makeInfo(wordId: string, difficulty: "easy" | "medium" | "hard", mastery: number, reviewPriority: number): WordDifficultyInfo {
  return { wordId, difficulty, mastery, reviewPriority };
}

describe("computeMastery (AI-602)", () => {
  it("零/负次数返回 0", () => {
    expect(computeMastery(0, 0)).toBe(0);
    expect(computeMastery(-1, 0)).toBe(0);
  });
  it("全对 100，全错 0", () => {
    expect(computeMastery(1, 1)).toBe(100);
    expect(computeMastery(3, 0)).toBe(0);
  });
  it("四舍五入", () => {
    expect(computeMastery(3, 1)).toBe(33);
    expect(computeMastery(3, 2)).toBe(67);
  });
});

describe("computeDifficulty (AI-602)", () => {
  it("次数不足（<3）则保持 easy，即使掌握度高", () => {
    expect(computeDifficulty(100, 1)).toBe("easy");
    expect(computeDifficulty(100, 2)).toBe("easy");
  });
  it(">=3 次且 >=80% → hard", () => {
    expect(computeDifficulty(80, 3)).toBe("hard");
    expect(computeDifficulty(100, 3)).toBe("hard");
  });
  it(">=3 次但 <80% 且 >=50% → medium（未达 hard 线）", () => {
    expect(computeDifficulty(79, 3)).toBe("medium");
    expect(computeDifficulty(50, 3)).toBe("medium");
  });
  it(">=3 次但 <50% → easy（掌握度不足）", () => {
    expect(computeDifficulty(49, 3)).toBe("easy");
    expect(computeDifficulty(0, 5)).toBe("easy");
  });
});

describe("computeReviewPriority (AI-602)", () => {
  const now = Date.now();
  it("掌握度越低优先级越高", () => {
    expect(computeReviewPriority(0, now)).toBeGreaterThan(computeReviewPriority(100, now));
  });
  it("越久未练优先级越高", () => {
    const fresh = computeReviewPriority(100, now);
    const stale = computeReviewPriority(100, now - 5 * 86400000);
    expect(stale).toBeGreaterThan(fresh);
  });
  it("未练（无时间戳）有基础权重且 > 0", () => {
    expect(computeReviewPriority(0, null)).toBeGreaterThan(0);
  });
});

describe("sortWordsByReviewPriority (AI-602)", () => {
  it("弱词排在前，熟词排在后", () => {
    const words = [makeWord("a"), makeWord("b"), makeWord("c")];
    const map = buildDifficultyMap([
      makeInfo("a", "hard", 100, 5),
      makeInfo("b", "easy", 20, 95),
      makeInfo("c", "medium", 60, 50),
    ]);
    const sorted = sortWordsByReviewPriority(words, map).map((w) => w.id);
    expect(sorted[0]).toBe("b"); // 最高优先级
    expect(sorted[sorted.length - 1]).toBe("a"); // 最低优先级
  });

  it("未练词（map 缺失）排末尾，保持原相对顺序", () => {
    const words = [makeWord("a"), makeWord("b")];
    const map = buildDifficultyMap([makeInfo("a", "easy", 30, 80)]);
    const sorted = sortWordsByReviewPriority(words, map).map((w) => w.id);
    expect(sorted[0]).toBe("a");
    expect(sorted[1]).toBe("b"); // 未练 → 末尾
  });
});

describe("countByDifficulty (AI-602)", () => {
  it("空数组 → 全 0", () => {
    expect(countByDifficulty([])).toEqual({ easy: 0, medium: 0, hard: 0 });
  });
  it("混合计数", () => {
    const infos = [
      makeInfo("a", "easy", 10, 90),
      makeInfo("b", "easy", 20, 80),
      makeInfo("c", "medium", 60, 50),
      makeInfo("d", "hard", 100, 5),
    ];
    expect(countByDifficulty(infos)).toEqual({ easy: 2, medium: 1, hard: 1 });
  });
});
