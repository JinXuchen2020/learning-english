import { describe, it, expect } from "vitest";
import {
  mondayOfWeekUTC,
  addDaysUTC,
  weekEndOf,
  todayUtc,
} from "./weekly";

describe("mondayOfWeekUTC", () => {
  it("周三 2026-08-05 → 本周一 2026-08-03", () => {
    expect(mondayOfWeekUTC("2026-08-05")).toBe("2026-08-03");
  });

  it("周一 2026-08-03 → 自身", () => {
    expect(mondayOfWeekUTC("2026-08-03")).toBe("2026-08-03");
  });

  it("周日 2026-08-09 → 回到本周一 2026-08-03（ISO 周起始为周一）", () => {
    expect(mondayOfWeekUTC("2026-08-09")).toBe("2026-08-03");
  });

  it("跨月：2026-08-01(周六) → 2026-07-27", () => {
    expect(mondayOfWeekUTC("2026-08-01")).toBe("2026-07-27");
  });

  it("跨年：2027-01-01(周五) → 2026-12-28", () => {
    expect(mondayOfWeekUTC("2027-01-01")).toBe("2026-12-28");
  });
});

describe("addDaysUTC", () => {
  it("普通加 6 天", () => {
    expect(addDaysUTC("2026-08-03", 6)).toBe("2026-08-09");
  });

  it("跨月减 1 天：2026-08-01 - 1 = 2026-07-31", () => {
    expect(addDaysUTC("2026-08-01", -1)).toBe("2026-07-31");
  });

  it("跨年减 1 天：2026-01-01 - 1 = 2025-12-31", () => {
    expect(addDaysUTC("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("加 7 天得到下周一（周导航）", () => {
    expect(addDaysUTC("2026-08-03", 7)).toBe("2026-08-10");
  });
});

describe("weekEndOf", () => {
  it("周起始 + 6 = 周日", () => {
    expect(weekEndOf("2026-08-03")).toBe("2026-08-09");
  });
});

describe("todayUtc", () => {
  it("返回 YYYY-MM-DD 形态", () => {
    expect(todayUtc()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
