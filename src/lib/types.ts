export type MascotExpression = "happy" | "thinking" | "celebrating" | "encouraging";
export type MascotSize = "small" | "medium" | "large";

export interface Course {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  totalLessons: number;
  completedLessons: number;
  wordCount: number;
}

export type LessonState = "locked" | "available" | "completed";

export interface Lesson {
  id: string;
  courseId: string;
  title: string;
  state: LessonState;
  wordCount: number;
  estimatedMinutes: number;
}

export interface Word {
  id: string;
  text: string;
  phonics: string;
  meaning: string;
  illustration: string;
  options: string[];
  correctIndex: number;
}

export interface DailyTask {
  id: string;
  title: string;
  description: string;
  icon: "headphones" | "mic" | "pencil";
  completed: boolean;
}

export type QuizPhase = "answering" | "correct" | "incorrect" | "complete";

export interface QuizState {
  phase: QuizPhase;
  currentWordIndex: number;
  selectedAnswer: number | null;
  correctCount: number;
  totalWords: number;
}

/* ----------------------- AI Study Plan (AI-207) ----------------------- */

/** 学习计划技能类型（与后端 `StudyPlanSkillType` 同口径）。 */
export type PlanSkillType = "vocab" | "listen" | "speak" | "write";

/** 学习计划等级（与 `POST /api/ai/plan/generate` 的 `level` 枚举一致）。 */
export type PlanLevel = "pre-a1" | "a1" | "a2";

/** 单节计划内的学习任务。 */
export interface PlanLesson {
  type?: "main" | "review" | "speaking";
  title?: string;
  skillType?: PlanSkillType;
  description?: string;
  courseId?: string;
  lessonId?: string;
}

/** 计划中的某一天。 */
export interface PlanDay {
  day?: number;
  date?: string;
  skillType?: PlanSkillType;
  title?: string;
  lessons?: PlanLesson[];
  content?: string;
}

/** 计划中的某一周。 */
export interface PlanWeek {
  week?: number;
  theme?: string;
  days?: PlanDay[];
}

/** LLM 生成的结构化学习计划（宽松结构，容忍自由 JSON）。 */
export interface GeneratedPlan {
  weeks?: PlanWeek[];
  rawText?: string;
  [key: string]: unknown;
}

/** `POST /api/ai/plan/generate` 响应：`degraded` 为真表示走了模板兜底。 */
export interface GeneratePlanResponse {
  plan: GeneratedPlan;
  model?: string;
  degraded: boolean;
}

/** `POST /api/ai/plan/generate` 请求体（字段名/类型/枚举与后端 DTO 对齐）。 */
export interface GeneratePlanDto {
  childId: string;
  ageRange: string; // "lo-hi"，如 "6-8"
  level: PlanLevel;
  dailyMinutes: number; // 5-120
  interests: string[]; // 至少 1 个
  weeks: number; // 1-4
  useTemplate?: boolean;
}

/** `POST /api/ai/plan/save` 请求体（AI-206，字段名/类型与后端 `SavePlanDto` 对齐）。 */
export interface SavePlanDto {
  childId: string;
  plan: GeneratedPlan;
}

/** `POST /api/ai/plan/save` 响应（AI-206：`SavePlanResult`）。 */
export interface SavePlanResponse {
  id: string;
  status: string; // "draft"
}

/** `POST /api/ai/plan/:id/apply` 请求体（AI-206，字段名/类型与后端 `ApplyPlanDto` 对齐）。 */
export interface ApplyPlanDto {
  confirm?: boolean;
}

/** `POST /api/ai/plan/:id/apply` 响应（AI-206：`ApplyPlanResult`）。 */
export interface ApplyPlanResponse {
  id: string;
  status: string; // "applied"
  appliedDays: number;
  tasksCreated: number;
  appliedAt: string;
}
