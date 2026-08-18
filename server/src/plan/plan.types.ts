import { StudyPlanSkillType } from './study-plan.entity';
import { PlanLevel } from './dto/generate-plan.dto';

/**
 * 单节计划内的学习任务（AI-202 仅透传 LLM 自由结构，字段均为可选）。
 * AI-203 提示词 / AI-204 Schema 校验会进一步约束取值。
 */
export interface PlanLesson {
  /** 任务类型：主课 / 复习 / 口语。 */
  type?: 'main' | 'review' | 'speaking';
  /** 任务标题。 */
  title?: string;
  /** 关联技能类型（与 `StudyPlanSkillType` 同口径）。 */
  skillType?: StudyPlanSkillType;
  /** 任务描述/要点。 */
  description?: string;
  /**
   * 关联真实课程 UUID（`courses` 表）。AI-203 起由提示词要求引用真实 id；
   * 目录注入与存在性校验分别由 AI-204/AI-206 完成。
   */
  courseId?: string;
  /** 关联真实课时 UUID（`lessons` 表）。 */
  lessonId?: string;
}

/** 计划中的某一天。 */
export interface PlanDay {
  /** 计划内第几天（从 1 起）。 */
  day?: number;
  /** 计划日期 `YYYY-MM-DD`（落库阶段由 AI-206 写）。 */
  date?: string;
  /** 当日主技能类型。 */
  skillType?: StudyPlanSkillType;
  /** 当日主题。 */
  title?: string;
  /** 当日任务列表（1 主课 + 2 复习 + 1 口语 等）。 */
  lessons?: PlanLesson[];
  /** 当日计划正文（自由文本 / JSON）。 */
  content?: string;
}

/** 计划中的某一周。 */
export interface PlanWeek {
  /** 第几周（从 1 起）。 */
  week?: number;
  /** 本周主题（提示词约定输出，落库阶段可选持久化）。 */
  theme?: string;
  /** 本周每日计划。 */
  days?: PlanDay[];
}

/**
 * LLM 生成的结构化学习计划（宽松结构，容忍自由 JSON）。
 * 携带索引签名以透传 LLM 可能附加的字段（如 `summary`/`tips`），
 * 避免解析期因未知字段被 TS 拒绝；AI-204 再做严格 Schema 校验。
 */
export interface GeneratedPlan {
  weeks?: PlanWeek[];
  /** 演示/降级路径下承载 LLM 原始文本。 */
  rawText?: string;
  [key: string]: unknown;
}

/**
 * `POST /api/ai/plan/generate` 响应（AI-202）。
 * 计划未持久化，待用户在前端确认后由 AI-206 落库。
 */
export interface GeneratePlanResponse {
  /** 结构化学习计划（含 `rawText` 兜底）。 */
  plan: GeneratedPlan;
  /** 实际使用的 provider 模型标识。 */
  model?: string;
  /**
   * 是否为降级输出。
   * 当前语义：`generatePlan` 出错（非法 JSON / Schema 校验失败 / 被截断）一律抛
   * `BadRequestException`，**不再降级模板**；因此本字段恒为 `false`。
   * `useTemplate=true`（用户显式选模板）亦返回 `degraded:false`（`model:'template'`）。
   * 前端可按需忽略此字段。
   */
  degraded: boolean;
}

/**
 * 课程目录项（供 PlanAgent 引用真实 id）。AI-203 定义类型；
 * 实际目录数据由 AI-204/AI-206 从 `courses`/`lessons` 表注入。
 */
export interface PlanCatalogCourse {
  /** `courses` 表 UUID。 */
  courseId: string;
  /** 课程标题。 */
  title: string;
}

/** 课时目录项。 */
export interface PlanCatalogLesson {
  /** `lessons` 表 UUID。 */
  lessonId: string;
  /** 课时标题。 */
  title: string;
  /** 所属课程 UUID。 */
  courseId: string;
  /** 课时主技能类型。 */
  skillType: StudyPlanSkillType;
  /** 适用等级（与 `PlanLevel` 同口径）。 */
  level: PlanLevel;
  /** 预计时长（分钟）。 */
  estimatedMinutes: number;
}

/** 注入 PlanAgent 的课程目录（真实 id 来源）。 */
export interface PlanCatalog {
  courses: PlanCatalogCourse[];
  lessons: PlanCatalogLesson[];
}

/**
 * 计划完成度快照（AI-209，`GET /api/ai/plan/status` 响应）。
 * 取该 childId 最近一份 `applied` 计划，统计其 `study_plan_days` 完成度。
 */
export interface PlanStatusResult {
  /** 是否存在已应用的计划。false 时前端隐藏完成度卡。 */
  hasPlan: boolean;
  /** 计划总天数（study_plan_days 行数）。 */
  totalDays: number;
  /** 已完成天数（isDone=true 的行数）。 */
  doneDays: number;
  /** 完成度比例 doneDays/totalDays（0-1）；totalDays=0 时为 0（避免除零）。 */
  completionRatio: number;
  /** 计划 UUID（hasPlan 时存在）。 */
  planId?: string;
  /** 应用日期 `YYYY-MM-DD`（hasPlan 时存在，取 plan.updatedAt 口径）。 */
  appliedAt?: string;
}
