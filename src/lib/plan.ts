import type { PlanLevel, PlanSkillType, PlanDay, PlanLesson } from "./types";

/**
 * 学习计划向导的纯逻辑层（AI-207）。
 *
 * 仅放「无副作用、可单测」的内容：选择器常量 + 表单校验纯函数。
 * UI 组件 (`app/plan/page.tsx`) 与单元测试 (`lib/plan.spec.ts`) 共享此处，
 * 不在此处放任何 React / fetch 逻辑。
 */

/** 等级选项（与后端 `PLAN_LEVELS` 枚举 `pre-a1|a1|a2` 一致）。 */
export const PLAN_LEVELS: { value: PlanLevel; label: string }[] = [
  { value: "pre-a1", label: "Pre-A1 · 刚起步" },
  { value: "a1", label: "A1 · 入门" },
  { value: "a2", label: "A2 · 进阶" },
];

/** 年龄段预设（格式 `lo-hi`，满足后端 `ageRange` 正则）。 */
export const AGE_RANGES = ["5-6", "6-8", "8-10", "10-12"] as const;

/**
 * 每日学习时长预设（分钟）。覆盖 AI-205 三档：
 * 10→short(≤15) / 20·30→standard(16-45) / 45→extended(≥46 边界内最大预设)。
 */
export const DAILY_MINUTE_OPTIONS = [10, 20, 30, 45] as const;

/** 兴趣标签预设（多选，至少 1 个）。 */
export const INTEREST_OPTIONS = [
  "动物",
  "太空",
  "水果",
  "运动",
  "音乐",
  "恐龙",
  "汽车",
  "颜色",
] as const;

/** 计划周期（周）预设。 */
export const WEEK_OPTIONS = [1, 2, 3, 4] as const;

/** 向导表单的当前取值。 */
export interface PlanFormValues {
  ageRange: string;
  level: PlanLevel | "";
  dailyMinutes: number | null;
  interests: string[];
  weeks: number | null;
}

/** 各字段的错误文案（仅在该字段非法时存在键）。 */
export type PlanFormErrors = Partial<
  Record<"ageRange" | "level" | "dailyMinutes" | "interests" | "weeks", string>
>;

/**
 * 纯函数：校验向导表单。
 * 返回对象仅包含非法字段的报错文案（空对象 = 全部合法）。
 * 字段级规则与后端 DTO 的 class-validator 口径对齐（兴趣≥1、其余必填）。
 */
export function validatePlanForm(values: PlanFormValues): PlanFormErrors {
  const errors: PlanFormErrors = {};

  if (!values.ageRange) {
    errors.ageRange = "请先选择年龄段～";
  }
  if (!values.level) {
    errors.level = "请选择你现在的英语等级～";
  }
  if (values.dailyMinutes === null || values.dailyMinutes === undefined) {
    errors.dailyMinutes = "请选择每天想学多久～";
  }
  if (!values.interests || values.interests.length === 0) {
    errors.interests = "至少选一个你喜欢的东西！";
  }
  if (values.weeks === null || values.weeks === undefined) {
    errors.weeks = "请选择计划要学几周～";
  }

  return errors;
}

/** 便捷判断：表单是否可提交。 */
export function isPlanFormValid(values: PlanFormValues): boolean {
  return Object.keys(validatePlanForm(values)).length === 0;
}

/* ----------------------- 计划展示（AI-208） ----------------------- */

/**
 * 技能类型 → 展示配色（用于周计划每日卡片上色）。
 * 与 `server/src/plan/plan.service.ts` 的 `iconForSkill`（headphones/mic/pencil 口径）
 * 不冲突——这里只管颜色，图标由后端 apply 时映射。
 */
export const PLAN_SKILL_COLORS: Record<PlanSkillType, string> = {
  vocab: "#F59E0B", // 词汇 · 琥珀
  listen: "#3B82F6", // 听力 · 蓝
  speak: "#EC4899", // 口语 · 粉
  write: "#10B981", // 书写 · 绿
};

/** 取技能类型对应的颜色；未指定时回落到词汇色（保证卡片始终有颜色）。 */
export function planSkillColor(skill?: PlanSkillType): string {
  if (skill && skill in PLAN_SKILL_COLORS) return PLAN_SKILL_COLORS[skill];
  return PLAN_SKILL_COLORS.vocab;
}

/** 单节任务的简短类型标签（用于卡片内 lesson 小标）。 */
export function planLessonTypeLabel(lesson?: PlanLesson): string {
  if (!lesson) return "";
  if (lesson.type === "main") return "主课";
  if (lesson.type === "review") return "复习";
  if (lesson.type === "speaking") return "口语";
  return lesson.skillType ? skillLabel(lesson.skillType) : "";
}

function skillLabel(skill: PlanSkillType): string {
  switch (skill) {
    case "vocab":
      return "词汇";
    case "listen":
      return "听力";
    case "speak":
      return "口语";
    case "write":
      return "书写";
  }
}

/** 技能类型 → 中文标签（用于卡片角标）。 */
export function planSkillLabel(skill: PlanSkillType): string {
  return skillLabel(skill);
}

/**
 * 纯函数：把一个计划日格式化为展示所需的字段。
 * - `label`：日标题，缺省回落 `第 N 天`（N = index+1）。
 * - `color`：按 `day.skillType`（否则首日 lesson 的 skillType）上色。
 * - `lessonCount`：lessons 数（空数组 → 0）。
 * - `skills`：去重后的技能类型列表（用于卡片角标）。
 */
export function formatPlanDay(
  day: PlanDay,
  index: number
): { label: string; color: string; lessonCount: number; skills: PlanSkillType[] } {
  const lessons = day.lessons ?? [];
  const skill =
    day.skillType ??
    lessons.find((l) => l.skillType)?.skillType ??
    undefined;
  const skills = Array.from(
    new Set(
      lessons
        .map((l) => l.skillType)
        .filter((s): s is PlanSkillType => Boolean(s)),
    ),
  );
  return {
    label: day.title ?? `第 ${index + 1} 天`,
    color: planSkillColor(skill),
    lessonCount: lessons.length,
    skills,
  };
}
