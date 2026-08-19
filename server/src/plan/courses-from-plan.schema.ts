/**
 * CoursePlan JSON Schema 校验（AI-801）。
 *
 * 校验 `generateCoursesForPlan` 调 AI 产出的「计划 → 课程」结构：
 *  - 根对象：`course` 对象（title/description/icon/color 必填非空）+ `lessons` 数组（非空）
 *  - 每 lesson：`title` 必填非空、`estimatedMinutes` 可选 number、`words` 数组（非空）
 *  - 每 word：`text`/`phonics`/`meaning` 必填非空字符串；
 *    `options` 为长度 2–4 的字符串数组（含正确项）；`correctIndex` 为整数且在 [0, options.length-1]。
 *
 * 设计取舍（与 `plan-schema.ts` 一致）：只校验「结构合法性」与「单词测验字段有效性」，
 * 不校验内容完整性（如每节必须恰好 N 词）——那是提示词约束。允许 LLM 附加的未知字段
 * （如 `example`/`exampleTrans`）透传但被落库层忽略，避免严格拒绝可用内容。
 */

/** 单条待落库单词（AI 产出 + 校验后）。 */
export interface CoursePlanWordSpec {
  text: string;
  phonics: string;
  meaning: string;
  /** 测验选项（含正确项），长度 2–4。 */
  options: string[];
  /** 正确项在 `options` 中的下标。 */
  correctIndex: number;
  /** LLM 可选附加（落库忽略）：英文例句。 */
  example?: string;
  /** LLM 可选附加（落库忽略）：例句中文翻译。 */
  exampleTrans?: string;
}

/** 单节待落库课时。 */
export interface CoursePlanLessonSpec {
  title: string;
  estimatedMinutes?: number;
  words: CoursePlanWordSpec[];
}

/** 整门待落库课程（AI 产出 + 校验后）。 */
export interface CoursePlanSpec {
  course: {
    title: string;
    description: string;
    icon: string;
    color: string;
  };
  lessons: CoursePlanLessonSpec[];
  [key: string]: unknown;
}

export interface CoursePlanValidationResult {
  ok: boolean;
  errors: string[];
  value?: CoursePlanSpec;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function validateWord(raw: unknown, path: string, errors: string[]): void {
  if (!isRecord(raw)) {
    errors.push(`${path} 必须是对象`);
    return;
  }
  const w = raw as Record<string, unknown>;
  if (!isNonEmptyString(w.text)) errors.push(`${path}.text 必须是非空字符串`);
  if (!isNonEmptyString(w.phonics)) errors.push(`${path}.phonics 必须是非空字符串`);
  if (!isNonEmptyString(w.meaning)) errors.push(`${path}.meaning 必须是非空字符串`);

  if (!Array.isArray(w.options)) {
    errors.push(`${path}.options 必须是数组`);
    return;
  }
  if (w.options.length < 2 || w.options.length > 4) {
    errors.push(`${path}.options 长度须为 2–4`);
    return;
  }
  if (!w.options.every((o) => typeof o === 'string' && o.length > 0)) {
    errors.push(`${path}.options 每项必须是非空字符串`);
  }
  if (typeof w.correctIndex !== 'number' || !Number.isInteger(w.correctIndex)) {
    errors.push(`${path}.correctIndex 必须是整数`);
    return;
  }
  if (w.correctIndex < 0 || w.correctIndex >= w.options.length) {
    errors.push(`${path}.correctIndex 超出 options 范围 [0, ${w.options.length - 1}]`);
  }
}

function validateLesson(raw: unknown, li: number, errors: string[]): void {
  const path = `lessons[${li}]`;
  if (!isRecord(raw)) {
    errors.push(`${path} 必须是对象`);
    return;
  }
  const l = raw as Record<string, unknown>;
  if (!isNonEmptyString(l.title)) errors.push(`${path}.title 必须是非空字符串`);
  if (l.estimatedMinutes !== undefined && typeof l.estimatedMinutes !== 'number') {
    errors.push(`${path}.estimatedMinutes 必须是数字`);
  }
  const words = l.words;
  if (!Array.isArray(words)) {
    errors.push(`${path}.words 必须是数组`);
    return;
  }
  if (words.length === 0) {
    errors.push(`${path}.words 不能为空`);
    return;
  }
  words.forEach((w, wi) => validateWord(w, `${path}.words[${wi}]`, errors));
}

/**
 * 校验 AI 生成的「计划 → 课程」结构。
 * @param raw `JSON.parse` 后的任意值
 * @returns 聚合错误与（通过时的）结构化课程规格
 */
export function validateCoursePlan(raw: unknown): CoursePlanValidationResult {
  const errors: string[] = [];

  if (!isRecord(raw)) {
    return { ok: false, errors: ['根节点必须是 JSON 对象'] };
  }

  const course = (raw as Record<string, unknown>).course;
  if (!isRecord(course)) {
    errors.push('course 必须是对象');
  } else {
    const c = course as Record<string, unknown>;
    if (!isNonEmptyString(c.title)) errors.push('course.title 必须是非空字符串');
    if (!isNonEmptyString(c.description)) errors.push('course.description 必须是非空字符串');
    if (!isNonEmptyString(c.icon)) errors.push('course.icon 必须是非空字符串');
    if (!isNonEmptyString(c.color)) errors.push('course.color 必须是非空字符串');
  }

  const lessons = (raw as Record<string, unknown>).lessons;
  if (!Array.isArray(lessons)) {
    errors.push('lessons 必须是数组');
  } else if (lessons.length === 0) {
    errors.push('lessons 不能为空');
  } else {
    lessons.forEach((l, li) => validateLesson(l, li, errors));
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, errors: [], value: raw as CoursePlanSpec };
}
