import { describe, it, expect } from "vitest";
import { isSpeakingTask, speakingTaskHref, isLessonTask, lessonTaskHref } from "./tasks";
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

// ── AI-803：计划节引用任务的深链 ──────────────────────────────────────────────
describe("isLessonTask", () => {
  it("returns true when the task carries a real lessonId (plan reference)", () => {
    expect(isLessonTask({ lessonId: "lesson-1" })).toBe(true);
  });

  it("returns false for global-seed / generic tasks without a lessonId", () => {
    expect(isLessonTask({})).toBe(false);
    expect(isLessonTask({ lessonId: undefined })).toBe(false);
  });
});

describe("lessonTaskHref", () => {
  it("vocab/listen/write → /practice?lessonId=<encoded id>", () => {
    const task: Pick<DailyTask, "lessonId" | "skillType" | "id"> = {
      id: "t1",
      lessonId: "lesson-9",
      skillType: "vocab",
    };
    expect(lessonTaskHref(task)).toBe("/practice?lessonId=lesson-9");
  });

  it("encodes special characters in the lessonId", () => {
    const task: Pick<DailyTask, "lessonId" | "skillType" | "id"> = {
      id: "t1",
      lessonId: "a b/c",
      skillType: "listen",
    };
    expect(lessonTaskHref(task)).toBe("/practice?lessonId=a%20b%2Fc");
  });

  it("speak skill reuses the /speech deep link carrying taskId (keeps session write-back)", () => {
    const task: Pick<DailyTask, "lessonId" | "skillType" | "id"> = {
      id: "t3",
      lessonId: "lesson-7",
      skillType: "speak",
    };
    expect(lessonTaskHref(task)).toBe("/speech?taskId=t3");
  });
});
