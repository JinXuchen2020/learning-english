import { describe, it, expect } from "vitest";
import {
  shuffle,
  generateListenQuestions,
  generateCombinationQuestions,
  judgeListen,
  judgeCombination,
  buildQuizItems,
  type QuizMode,
} from "./quizVariants";
import type { Word } from "./types";

function makeWord(id: string, over: Partial<Word> = {}): Word {
  return {
    id,
    text: id,
    phonics: "p",
    meaning: "m",
    illustration: "",
    options: ["a", "b", "c", "d"],
    correctIndex: 0,
    ...over,
  };
}

/** 确定性随机源（LCG），相同 seed 复现相同序列。 */
function makeRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function comboWords(): Word[] {
  // 每个 (color,category) 唯一，且都具备 color/category
  return [
    makeWord("Cat", { color: "orange", category: "pet" }),
    makeWord("Dog", { color: "brown", category: "pet" }),
    makeWord("Fish", { color: "blue", category: "ocean" }),
    makeWord("Bird", { color: "blue", category: "sky" }),
    makeWord("Rabbit", { color: "white", category: "pet" }),
  ];
}

describe("shuffle", () => {
  it("不修改入参且为原集合的排列", () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });
  it("相同 rng 序列可复现", () => {
    const a = shuffle([1, 2, 3, 4, 5], makeRng(7));
    const b = shuffle([1, 2, 3, 4, 5], makeRng(7));
    expect(a).toEqual(b);
  });
});

describe("generateListenQuestions", () => {
  it("词数 < 2 返回空（无法构成含干扰项的题）", () => {
    expect(generateListenQuestions([makeWord("only")])).toEqual([]);
    expect(generateListenQuestions([])).toEqual([]);
  });

  it("2 个词 → 2 题，每题 2 选项，正确索引指向目标", () => {
    const words = [makeWord("A"), makeWord("B")];
    const qs = generateListenQuestions(words);
    expect(qs).toHaveLength(2);
    for (const q of qs) {
      expect(q.options).toHaveLength(2);
      expect(q.options[q.correctIndex].id).toBe(q.target.id);
      // 选项 id 不重复
      const ids = q.options.map((w) => w.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    // 两个词各作为 target 出现一次
    const targets = qs.map((q) => q.target.id).sort();
    expect(targets).toEqual(["A", "B"]);
  });

  it("4 个词（默认 4 选项）→ 4 题，每题 4 选项且含目标", () => {
    const words = ["A", "B", "C", "D"].map((id) => makeWord(id));
    const qs = generateListenQuestions(words);
    expect(qs).toHaveLength(4);
    for (const q of qs) {
      expect(q.options).toHaveLength(4);
      expect(q.options[q.correctIndex].id).toBe(q.target.id);
      const ids = q.options.map((w) => w.id);
      expect(new Set(ids).size).toBe(4);
    }
  });

  it("perQuiz 限制题目数", () => {
    const words = ["A", "B", "C", "D", "E"].map((id) => makeWord(id));
    const qs = generateListenQuestions(words, { perQuiz: 2 });
    expect(qs).toHaveLength(2);
  });

  it("相同 rng 复现相同结果", () => {
    const words = ["A", "B", "C", "D"].map((id) => makeWord(id));
    const a = generateListenQuestions(words, { rng: makeRng(99) });
    const b = generateListenQuestions(words, { rng: makeRng(99) });
    expect(a).toEqual(b);
  });
});

describe("generateCombinationQuestions", () => {
  it("单词缺 color/category 被过滤；无合法词返回空", () => {
    const words = [makeWord("X"), makeWord("Y", { color: "red" })];
    expect(generateCombinationQuestions(words)).toEqual([]);
  });

  it("(color,category) 重复 → 该组合不出题（歧义过滤）", () => {
    const words = [
      makeWord("A", { color: "red", category: "pet" }),
      makeWord("B", { color: "red", category: "pet" }), // 与 A 同组合
      makeWord("C", { color: "blue", category: "sky" }),
    ];
    const qs = generateCombinationQuestions(words);
    // 仅 C 的组合唯一 → 1 题；A/B 因歧义被排除
    expect(qs).toHaveLength(1);
    expect(qs[0].color).toBe("blue");
    expect(qs[0].category).toBe("sky");
  });

  it("唯一组合 → 出题且每题仅一个正确项", () => {
    const words = comboWords();
    const qs = generateCombinationQuestions(words);
    expect(qs).toHaveLength(words.length);
    for (const q of qs) {
      // 正确项同时匹配 prompt 的颜色与类别
      const correct = q.options[q.correctIndex];
      expect(correct.color).toBe(q.color);
      expect(correct.category).toBe(q.category);
      // 其余选项没有同时匹配者（无歧义）
      const matches = q.options.filter(
        (w) => w.color === q.color && w.category === q.category,
      );
      expect(matches).toHaveLength(1);
      expect(q.options).toHaveLength(Math.min(4, words.length));
    }
  });

  it("perQuiz 限制题目数", () => {
    const qs = generateCombinationQuestions(comboWords(), { perQuiz: 2 });
    expect(qs).toHaveLength(2);
  });

  it("相同 rng 复现相同结果", () => {
    const a = generateCombinationQuestions(comboWords(), { rng: makeRng(5) });
    const b = generateCombinationQuestions(comboWords(), { rng: makeRng(5) });
    expect(a).toEqual(b);
  });
});

describe("judgeListen / judgeCombination", () => {
  const listenQ = {
    type: "listen" as const,
    target: makeWord("T"),
    options: [makeWord("T"), makeWord("X"), makeWord("Y"), makeWord("Z")],
    correctIndex: 0,
  };
  const comboQ = {
    type: "combination" as const,
    color: "red",
    category: "pet",
    phrase: "red pet",
    options: [makeWord("X"), makeWord("T", { color: "red", category: "pet" }), makeWord("Y"), makeWord("Z")],
    correctIndex: 1,
  };

  it("命中正确索引 → true", () => {
    expect(judgeListen(listenQ, 0)).toBe(true);
    expect(judgeCombination(comboQ, 1)).toBe(true);
  });
  it("错误索引 → false", () => {
    expect(judgeListen(listenQ, 2)).toBe(false);
    expect(judgeCombination(comboQ, 0)).toBe(false);
  });
  it("越界 / 非整数 → false（防御）", () => {
    expect(judgeListen(listenQ, -1)).toBe(false);
    expect(judgeListen(listenQ, 4)).toBe(false);
    expect(judgeListen(listenQ, 1.5)).toBe(false);
    expect(judgeCombination(comboQ, 99)).toBe(false);
  });
});

describe("buildQuizItems", () => {
  const words = comboWords();

  it("multiple：文本选项、保留 correctIndex 与提示词", () => {
    const items = buildQuizItems(words, "multiple");
    expect(items).toHaveLength(words.length);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      expect(it.optionKind).toBe("text");
      expect(it.options.map((o) => o.label)).toEqual(words[i].options);
      expect(it.correctIndex).toBe(words[i].correctIndex);
      expect(it.promptText).toBe(words[i].text);
      expect(it.hidePromptText).toBeFalsy();
    }
  });

  it("listen：插图选项、隐藏提示文字", () => {
    const items = buildQuizItems(words, "listen");
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(it.optionKind).toBe("image");
      expect(it.hidePromptText).toBe(true);
      expect(it.promptText).toBeFalsy();
      for (const o of it.options) {
        expect(o.kind).toBe("image");
        expect(o.word).toBeDefined();
      }
      expect(it.options[it.correctIndex].word!.id).toBe(it.word.id);
    }
  });

  it("combination：插图选项 + 颜色/类别提示，正确项匹配组合", () => {
    const items = buildQuizItems(words, "combination");
    expect(items.length).toBe(words.length);
    for (const it of items) {
      expect(it.optionKind).toBe("image");
      expect(it.color).toBeTruthy();
      expect(it.category).toBeTruthy();
      expect(it.promptText).toBe(`${it.color} ${it.category}`);
      const correct = it.options[it.correctIndex].word!;
      expect(correct.color).toBe(it.color);
      expect(correct.category).toBe(it.category);
    }
  });

  it("空词表 → 各模式均返回空", () => {
    const modes: QuizMode[] = ["multiple", "listen", "combination"];
    for (const m of modes) {
      expect(buildQuizItems([], m)).toEqual([]);
    }
  });
});
