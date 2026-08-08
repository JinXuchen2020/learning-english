import { describe, it, expect } from "vitest";
import { filterWordCards, countByStatus } from "./wordCards";
import type { WordCard, WordCardStatus } from "./types";

/** 构造一张测试卡片（字段与后端 `WordCardView` 对齐）。 */
function makeCard(id: string, status: WordCardStatus): WordCard {
  return {
    id,
    wordText: "apple",
    meaning: "苹果",
    example: "I eat an apple.",
    exampleTrans: null,
    imagePrompt: "a red apple on a white table",
    interest: "食物",
    courseId: null,
    status,
    reviewerNote: null,
    createdAt: "2026-08-07T00:00:00.000Z",
    approvedAt: null,
  };
}

describe("filterWordCards (AI-601)", () => {
  const cards: WordCard[] = [
    makeCard("a", "pending"),
    makeCard("b", "approved"),
    makeCard("c", "pending"),
  ];

  it("status 为 null → 返回全部", () => {
    expect(filterWordCards(cards, null)).toHaveLength(3);
  });

  it("省略 status 参数 → 返回全部", () => {
    expect(filterWordCards(cards)).toHaveLength(3);
  });

  it("按 pending 过滤", () => {
    expect(filterWordCards(cards, "pending").map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("按 approved 过滤", () => {
    expect(filterWordCards(cards, "approved").map((c) => c.id)).toEqual(["b"]);
  });

  it("按 rejected 过滤（无匹配）", () => {
    expect(filterWordCards(cards, "rejected")).toHaveLength(0);
  });
});

describe("countByStatus (AI-601)", () => {
  it("空数组 → 全 0", () => {
    expect(countByStatus([])).toEqual({ pending: 0, approved: 0, rejected: 0 });
  });

  it("混合统计正确", () => {
    const cards: WordCard[] = [
      makeCard("a", "pending"),
      makeCard("b", "pending"),
      makeCard("c", "approved"),
      makeCard("d", "rejected"),
    ];
    expect(countByStatus(cards)).toEqual({ pending: 2, approved: 1, rejected: 1 });
  });
});
