import { describe, expect, it } from "vitest";
import {
  isPlanFormValid,
  validatePlanForm,
  planSkillColor,
  planLessonTypeLabel,
  formatPlanDay,
  type PlanFormValues,
} from "./plan";
import type { PlanDay } from "./types";

const VALID: PlanFormValues = {
  ageRange: "6-8",
  level: "a1",
  dailyMinutes: 20,
  interests: ["动物"],
  weeks: 2,
};

describe("validatePlanForm (AI-207 wizard validation)", () => {
  it("returns no errors for a fully-filled form", () => {
    expect(validatePlanForm(VALID)).toEqual({});
    expect(isPlanFormValid(VALID)).toBe(true);
  });

  it("flags missing ageRange", () => {
    const r = validatePlanForm({ ...VALID, ageRange: "" });
    expect(r.ageRange).toBeTruthy();
    expect(isPlanFormValid({ ...VALID, ageRange: "" })).toBe(false);
  });

  it("flags missing level", () => {
    const r = validatePlanForm({ ...VALID, level: "" });
    expect(r.level).toBeTruthy();
    expect(isPlanFormValid({ ...VALID, level: "" })).toBe(false);
  });

  it("flags missing dailyMinutes (null)", () => {
    const r = validatePlanForm({ ...VALID, dailyMinutes: null });
    expect(r.dailyMinutes).toBeTruthy();
    expect(isPlanFormValid({ ...VALID, dailyMinutes: null })).toBe(false);
  });

  it("flags empty interests array (need at least one)", () => {
    const r = validatePlanForm({ ...VALID, interests: [] });
    expect(r.interests).toBeTruthy();
    expect(isPlanFormValid({ ...VALID, interests: [] })).toBe(false);
  });

  it("flags missing weeks (null)", () => {
    const r = validatePlanForm({ ...VALID, weeks: null });
    expect(r.weeks).toBeTruthy();
    expect(isPlanFormValid({ ...VALID, weeks: null })).toBe(false);
  });

  it("aggregates every field when the form is completely empty", () => {
    const empty: PlanFormValues = {
      ageRange: "",
      level: "",
      dailyMinutes: null,
      interests: [],
      weeks: null,
    };
    const r = validatePlanForm(empty);
    expect(Object.keys(r).sort()).toEqual(
      ["ageRange", "dailyMinutes", "interests", "level", "weeks"].sort()
    );
    expect(isPlanFormValid(empty)).toBe(false);
  });

  it("treats a single interest as valid", () => {
    expect(validatePlanForm({ ...VALID, interests: ["恐龙"] })).toEqual({});
  });
});

describe("plan display helpers (AI-208)", () => {
  it("planSkillColor maps each skill type to a distinct color", () => {
    expect(planSkillColor("vocab")).toBe("#F59E0B");
    expect(planSkillColor("listen")).toBe("#3B82F6");
    expect(planSkillColor("speak")).toBe("#EC4899");
    expect(planSkillColor("write")).toBe("#10B981");
  });

  it("planSkillColor falls back to vocab color for undefined", () => {
    expect(planSkillColor(undefined)).toBe("#F59E0B");
    expect(planSkillColor("unknown" as never)).toBe("#F59E0B");
  });

  it("planLessonTypeLabel reflects lesson type", () => {
    expect(planLessonTypeLabel({ type: "main" })).toBe("主课");
    expect(planLessonTypeLabel({ type: "review" })).toBe("复习");
    expect(planLessonTypeLabel({ type: "speaking" })).toBe("口语");
    expect(planLessonTypeLabel({ skillType: "listen" })).toBe("听力");
    expect(planLessonTypeLabel(undefined)).toBe("");
    expect(planLessonTypeLabel({})).toBe("");
  });

  it("formatPlanDay falls back to 第 N 天 when title missing", () => {
    const day: PlanDay = { day: 0, lessons: [] };
    const r = formatPlanDay(day, 2);
    expect(r.label).toBe("第 3 天");
    expect(r.lessonCount).toBe(0);
    expect(r.skills).toEqual([]);
    expect(r.color).toBe("#F59E0B"); // undefined skill → vocab fallback
  });

  it("formatPlanDay derives color and skills from lessons when day.skillType absent", () => {
    const day: PlanDay = {
      title: "动物的一天",
      lessons: [
        { type: "main", skillType: "vocab", title: "Animals" },
        { type: "review", skillType: "vocab", title: "Review" },
        { type: "speaking", skillType: "speak", title: "Speak" },
      ],
    };
    const r = formatPlanDay(day, 0);
    expect(r.label).toBe("动物的一天");
    expect(r.lessonCount).toBe(3);
    expect(r.skills).toEqual(["vocab", "speak"]);
    expect(r.color).toBe("#F59E0B"); // first lesson skill = vocab
  });

  it("formatPlanDay uses day.skillType over lesson skills", () => {
    const day: PlanDay = {
      skillType: "listen",
      lessons: [{ skillType: "vocab", title: "x" }],
    };
    const r = formatPlanDay(day, 0);
    expect(r.color).toBe("#3B82F6"); // listen
    expect(r.skills).toEqual(["vocab"]);
  });
});
