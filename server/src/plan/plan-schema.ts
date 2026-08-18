import { GeneratedPlan, PlanLesson, PlanDay, PlanWeek } from './plan.types';
import { STUDY_PLAN_SKILL_TYPES, StudyPlanSkillType } from './study-plan.entity';

/**
 * Plan JSON Schema 校验（AI-204）。
 *
 * 校验 LLM 输出「结构」与「lesson 引用格式有效性」：
 *  - 结构：根对象 → weeks[] 非空 → 每 week 含数字 week 字段 + days[] 非空 → 每 day
 *    含数字 day 字段 + lessons[] 非空 → 每 lesson 为对象。
 *  - lesson 引用格式：若携带 `type`/`skillType`/`title`，须为合法取值；`courseId`/
 *    `lessonId` 为「推荐计划」占位，未注入真实目录时**允许空字符串**（如 `""`），
 *    真实 id 由 AI-206 落库时解析/校验；仅当字段存在且类型非字符串时才报错。
 *
 * 不校验「内容完整性」（如每天必须恰好 4 节、必须覆盖四技能），那属于提示词约束，
 * 结构层只保证可安全渲染，避免过度拒绝可用计划。
 */

export const PLAN_LESSON_TYPES = ['main', 'review', 'speaking'] as const;
type PlanLessonType = (typeof PLAN_LESSON_TYPES)[number];

export interface PlanValidationResult {
  /** 是否通过校验。 */
  ok: boolean;
  /** 聚合的错误信息（ok=false 时非空）。 */
  errors: string[];
  /** 通过校验时的结构化计划（ok=true 时存在）。 */
  value?: GeneratedPlan;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function validateLesson(raw: unknown, path: string, errors: string[]): void {
  if (!isRecord(raw)) {
    errors.push(`${path} 必须是对象`);
    return;
  }
  const lesson = raw as Record<string, unknown>;
  if (lesson.type !== undefined && !PLAN_LESSON_TYPES.includes(lesson.type as PlanLessonType)) {
    errors.push(`${path}.type 非法（应为 main|review|speaking）`);
  }
  if (
    lesson.skillType !== undefined &&
    !STUDY_PLAN_SKILL_TYPES.includes(lesson.skillType as StudyPlanSkillType)
  ) {
    errors.push(`${path}.skillType 非法（应为 vocab|listen|speak|write）`);
  }
  if (lesson.title !== undefined && typeof lesson.title !== 'string') {
    errors.push(`${path}.title 必须是字符串`);
  }
  // courseId/lessonId 为「推荐计划」占位：未注入目录时允许空字符串（如 ""），
  // 真实 id 由 AI-206 落库时解析/校验；仅当字段存在但类型非字符串时才报错。
  if (lesson.courseId !== undefined && typeof lesson.courseId !== 'string') {
    errors.push(`${path}.courseId 必须是字符串`);
  }
  if (lesson.lessonId !== undefined && typeof lesson.lessonId !== 'string') {
    errors.push(`${path}.lessonId 必须是字符串`);
  }
}

function validateDay(raw: unknown, wIndex: number, dIndex: number, errors: string[]): void {
  const path = `weeks[${wIndex}].days[${dIndex}]`;
  if (!isRecord(raw)) {
    errors.push(`${path} 必须是对象`);
    return;
  }
  const day = raw as Record<string, unknown>;
  if (typeof day.day !== 'number') {
    errors.push(`${path}.day 必须是数字`);
  }
  const lessons = day.lessons;
  if (!Array.isArray(lessons)) {
    errors.push(`${path}.lessons 必须是数组`);
    return;
  }
  if (lessons.length === 0) {
    errors.push(`${path}.lessons 不能为空`);
    return;
  }
  lessons.forEach((l, li) => validateLesson(l, `${path}.lessons[${li}]`, errors));
}

function validateWeek(raw: unknown, wIndex: number, errors: string[]): void {
  const path = `weeks[${wIndex}]`;
  if (!isRecord(raw)) {
    errors.push(`${path} 必须是对象`);
    return;
  }
  const week = raw as Record<string, unknown>;
  if (typeof week.week !== 'number') {
    errors.push(`${path}.week 必须是数字`);
  }
  const days = week.days;
  if (!Array.isArray(days)) {
    errors.push(`${path}.days 必须是数组`);
    return;
  }
  if (days.length === 0) {
    errors.push(`${path}.days 不能为空`);
    return;
  }
  days.forEach((d, di) => validateDay(d, wIndex, di, errors));
}

/**
 * 校验 LLM 生成的计划结构。
 * @param raw `JSON.parse` 后的任意值
 * @returns 聚合错误与（通过时的）结构化计划
 */
export function validatePlan(raw: unknown): PlanValidationResult {
  const errors: string[] = [];

  if (!isRecord(raw)) {
    return { ok: false, errors: ['根节点必须是 JSON 对象'] };
  }

  const weeks = (raw as Record<string, unknown>).weeks;
  if (!Array.isArray(weeks)) {
    errors.push('weeks 必须是数组');
  } else if (weeks.length === 0) {
    errors.push('weeks 不能为空');
  } else {
    weeks.forEach((w, wi) => validateWeek(w, wi, errors));
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, errors: [], value: raw as GeneratedPlan };
}
