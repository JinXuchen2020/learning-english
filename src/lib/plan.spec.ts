import { describe, expect, it } from "vitest";
import {
  isPlanFormValid,
  validatePlanForm,
  type PlanFormValues,
} from "./plan";

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
