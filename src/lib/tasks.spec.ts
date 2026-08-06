import { describe, it, expect } from "vitest";
import { isSpeakingTask, speakingTaskHref } from "./tasks";
import type { DailyTask } from "./types";

describe("isSpeakingTask", () => {
  it("returns true for a mic task", () => {
    expect(isSpeakingTask({ icon: "mic" })).toBe(true);
  });

  it("returns false for headphones / pencil tasks", () => {
    expect(isSpeakingTask({ icon: "headphones" })).toBe(false);
    expect(isSpeakingTask({ icon: "pencil" })).toBe(false);
  });
});

describe("speakingTaskHref", () => {
  it("builds a /speech deep link carrying the task id", () => {
    expect(speakingTaskHref("abc-123")).toBe("/speech?taskId=abc-123");
  });

  it("encodes special characters in the task id", () => {
    expect(speakingTaskHref("a b/c")).toBe("/speech?taskId=a%20b%2Fc");
  });
});

// 类型护栏：函数应接受真实的 DailyTask 形状
const sample: DailyTask = {
  id: "t2",
  title: "Say It Out Loud",
  description: "Practice speaking 2 words",
  icon: "mic",
  completed: false,
};
describe("type compatibility", () => {
  it("accepts a full DailyTask", () => {
    expect(isSpeakingTask(sample)).toBe(true);
    expect(speakingTaskHref(sample.id)).toContain("taskId=t2");
  });
});
