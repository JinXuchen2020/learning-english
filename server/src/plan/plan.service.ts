import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiProvider, AI_PROVIDER_TOKEN, ChatMessage, ChatOptions } from '../ai/ai-provider.interface';
import { GeneratePlanDto } from './dto/generate-plan.dto';
import { SavePlanDto } from './dto/save-plan.dto';
import { GeneratePlanResponse, GeneratedPlan, PlanDay, PlanStatusResult } from './plan.types';
import { PLAN_SYSTEM_PROMPT, buildPlanUserPrompt } from './plan-agent.prompt';
import { validatePlan } from './plan-schema';
import { buildFallbackPlan } from './plan-template';
import { StudyPlan, StudyPlanSkillType, STUDY_PLAN_SKILL_TYPES } from './study-plan.entity';
import { StudyPlanDay } from './study-plan-day.entity';
import { TasksService } from '../tasks/tasks.service';

/** `savePlan` 返回（AI-206）。 */
export interface SavePlanResult {
  id: string;
  status: StudyPlan['status'];
}

/** `applyPlan` 返回（AI-206）。 */
export interface ApplyPlanResult {
  id: string;
  status: 'applied';
  appliedDays: number;
  tasksCreated: number;
  appliedAt: string;
}

/**
 * 学习计划生成服务（AI-202 编排 + AI-203 双语 PlanAgent 提示词 + AI-204 Schema 校验/重试/模板降级
 * + AI-206 持久化 save / 应用 apply）。
 *
 * 编排：`GeneratePlanDto` → 组装 chat 消息（system=双语儿科友好 PlanAgent 提示词，
 * user=学习者画像 + 可选课程目录）→ `AiProvider.chat` → 剥离代码围栏 → `validatePlan`
 * 结构校验 → 合规则返回；不合规则**自动重试**（≤`MAX_PLAN_ATTEMPTS` 次，重试请求附带
 * `retryNote` 自我纠正）→ 仍失败降级为 `buildFallbackPlan` 内置模板（`degraded:true`）。
 * 不落库（落库/应用为 AI-206）。
 *
 * 持久化（AI-206）：`savePlan` 将合法 `GeneratedPlan` 落库为 `draft` `StudyPlan`+`StudyPlanDay`；
 * `applyPlan(id)` 将草稿置为 `applied`，按天填 `date` 并写入 `daily_tasks`（经 `TasksService`）。
 *
 * 依赖全局 `AiProvider`（`AiModule` 的 `@Global()` 注入 `AI_PROVIDER_TOKEN`），
 * 因此 `PlanModule` 无需重复 import `AiModule`。`StudyPlan`/`StudyPlanDay` 仓库与
 * `TasksService` 由 `PlanModule` 经 `TypeOrmModule.forFeature` + 导入 `TasksModule` 提供。
 *
 * 重试边界（AI-204 硬约束）：仅「输出校验失败」重试；`AiProvider.chat` 抛出的基础设施
 * 异常**向上传播**（不在本层重试，避免与 AI-106 的 HTTP 层 3 次退避叠加成 9 次）。
 */
@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  /** 计划生成最大尝试次数（AI-204）：首轮 + 至多 2 次重试。 */
  static readonly MAX_PLAN_ATTEMPTS = 3;

  constructor(
    @Inject(AI_PROVIDER_TOKEN) private readonly ai: AiProvider,
    @InjectRepository(StudyPlan) private readonly planRepo: Repository<StudyPlan>,
    @InjectRepository(StudyPlanDay) private readonly dayRepo: Repository<StudyPlanDay>,
    private readonly tasksService: TasksService,
  ) {}

  /**
   * 生成学习计划（含 Schema 校验 + 自动重试 + 模板降级）。
   * @param dto 经 class-validator 校验后的请求体
   * @returns 结构化计划响应（含 `degraded` 标志）
   * @throws 当 `AiProvider.chat` 抛错时向上传播（AI-106 重试/配额在外层处理）
   */
  async generatePlan(dto: GeneratePlanDto): Promise<GeneratePlanResponse> {
    // AI-205：用户主动选模板 → 跳过 LLM，直出内置模板计划（非失败态，degraded:false）。
    if (dto.useTemplate) {
      this.logger.log('[Plan] 用户主动选择模板生成，跳过 LLM，直出内置模板计划');
      return { plan: buildFallbackPlan(dto), model: 'template', degraded: false };
    }

    let lastErrors: string[] = [];
    let lastRawText = '';

    for (let attempt = 1; attempt <= PlanService.MAX_PLAN_ATTEMPTS; attempt++) {
      const messages = this.buildMessages(dto, attempt);
      // AI-重构后 provider 默认 50s 超时；plan 生成走思考模型易接近 Vercel 60s 上限，
      // 故再收紧到 45s 且禁 provider 级重试（PlanService 自身已按 Schema 失败重试 3 次）。
      const options: ChatOptions = {
        temperature: 0.4,
        maxTokens: 2048,
        timeoutMs: 45_000,
        maxAttempts: 1,
      };

      // provider 基础设施异常 → 直接向上传播，不在本层重试（避免与 AI-106 叠加）。
      const result = await this.ai.chat(messages, options);
      lastRawText = result.text;

      let parsed: unknown;
      try {
        parsed = JSON.parse(extractJson(result.text));
      } catch {
        lastErrors = ['响应不是合法 JSON'];
        this.logger.warn('[Plan] 第 %d 次生成：响应非合法 JSON，将重试', attempt);
        continue;
      }

      const validation = validatePlan(parsed);
      if (validation.ok) {
        return { plan: validation.value!, model: result.model, degraded: false };
      }

      lastErrors = validation.errors;
      this.logger.warn(
        '[Plan] 第 %d 次生成校验失败（%d 项）：%s',
        attempt,
        validation.errors.length,
        validation.errors.join('; '),
      );
    }

    // 重试耗尽 → 降级内置模板计划（前端可渲染，标记 degraded）。
    this.logger.warn(
      '[Plan] 重试 %d 次后仍不符合 Schema，降级内置模板计划；末次错误：%s',
      PlanService.MAX_PLAN_ATTEMPTS,
      lastErrors.join('; '),
    );
    return { plan: buildFallbackPlan(dto), model: 'template', degraded: true };
  }

  /**
   * 持久化生成计划为草稿（AI-206）。
   * @param dto `{ childId, plan }`
   * @returns 落库后的 `{ id, status }`
   * @throws BadRequestException 当 `plan` 结构不合法（复用 AI-204 `validatePlan`）
   */
  async savePlan(dto: SavePlanDto): Promise<SavePlanResult> {
    const validation = validatePlan(dto.plan);
    if (!validation.ok) {
      this.logger.warn('[Plan] save 拒绝非法计划结构：%s', validation.errors.join('; '));
      throw new BadRequestException({
        message: '计划结构不合法，无法保存',
        errors: validation.errors,
      });
    }

    const studyPlan = this.buildStudyPlan(dto.childId, validation.value!);
    const saved = await this.planRepo.save(studyPlan);
    this.logger.log('[Plan] 已保存草稿计划 %s（%d 天）', saved.id, saved.days.length);
    return { id: saved.id, status: saved.status };
  }

  /**
   * 应用计划：置 `applied`、按天填 `date`、写入 `daily_tasks`（AI-206）。
   * @param id 计划 UUID
   * @param confirm 重复应用确认（已 applied 且为 false → 409 needsConfirm）
   * @returns 应用结果
   * @throws NotFoundException 计划不存在；ConflictException 已应用未确认
   */
  async applyPlan(id: string, confirm: boolean): Promise<ApplyPlanResult> {
    const plan = await this.planRepo.findOne({ where: { id }, relations: ['days'] });
    if (!plan) {
      throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: '学习计划不存在' });
    }

    if (plan.status === 'applied' && !confirm) {
      this.logger.warn('[Plan] 计划 %s 已应用，未确认即重复应用 → 409 需确认', id);
      throw new ConflictException({
        code: 'PLAN_ALREADY_APPLIED',
        needsConfirm: true,
        message: '该计划已应用，重复应用将覆盖其每日任务，是否继续？',
      });
    }

    const today = new Date().toISOString().split('T')[0];
    const days = plan.days ?? [];
    for (const day of days) {
      day.date = addDays(today, day.dayIndex);
    }
    plan.status = 'applied';
    await this.planRepo.save(plan); // cascade 更新 days（含 date）

    const entries = days.map((day) => ({
      title: day.title,
      description: summarizeDay(day),
      icon: iconForSkill(day.skillType),
      sortOrder: day.dayIndex,
      userId: plan.userId,
      planDayId: day.id,
      date: day.date!,
    }));
    await this.tasksService.replacePlanTasks(
      plan.userId,
      days.map((d) => d.id),
      entries,
    );

    this.logger.log('[Plan] 已应用计划 %s：%d 天 → %d 个每日任务', id, days.length, entries.length);
    return {
      id: plan.id,
      status: 'applied',
      appliedDays: days.length,
      tasksCreated: entries.length,
      appliedAt: today,
    };
  }

  /**
   * 计划完成度快照（AI-209）：取 childId 最近一份 `applied` 计划，统计 days 完成度。
   * @param childId 计划归属用户 UUID
   * @returns `{ hasPlan, totalDays, doneDays, completionRatio, planId?, appliedAt? }`
   */
  async getPlanStatus(childId: string): Promise<PlanStatusResult> {
    const plan = await this.planRepo.findOne({
      where: { userId: childId, status: 'applied' },
      relations: ['days'],
      order: { updatedAt: 'DESC' },
    });
    if (!plan) {
      return { hasPlan: false, totalDays: 0, doneDays: 0, completionRatio: 0 };
    }

    const days = plan.days ?? [];
    const doneDays = days.filter((d) => d.isDone).length;
    const totalDays = days.length;
    return {
      hasPlan: true,
      totalDays,
      doneDays,
      completionRatio: totalDays === 0 ? 0 : doneDays / totalDays,
      planId: plan.id,
      appliedAt: plan.updatedAt ? plan.updatedAt.toISOString().split('T')[0] : undefined,
    };
  }

  /** 由合法 GeneratedPlan 构建草稿 StudyPlan（含按序 StudyPlanDay）。 */
  private buildStudyPlan(childId: string, plan: GeneratedPlan): StudyPlan {
    const days: PlanDay[] = (plan.weeks ?? []).flatMap((w) => w.days ?? []);
    const studyPlan = new StudyPlan();
    studyPlan.userId = childId;
    studyPlan.status = 'draft';
    studyPlan.skillType = firstSkillType(days) ?? 'vocab';
    studyPlan.days = days.map((d, i) => {
      const day = new StudyPlanDay();
      day.dayIndex = i;
      day.skillType = d.skillType ?? firstSkillType([d]) ?? 'vocab';
      day.title = d.title ?? `第 ${i + 1} 天`;
      day.content = d.content ?? JSON.stringify(d.lessons ?? []);
      day.date = null;
      day.isDone = false;
      return day;
    });
    return studyPlan;
  }

  /** 组装 system + user 消息。system 用双语儿科友好 PlanAgent 提示词（AI-203）；user 含学习者画像、可选课程目录，重试时附 `retryNote`。 */
  private buildMessages(dto: GeneratePlanDto, attempt: number): ChatMessage[] {
    return [
      { role: 'system', content: PLAN_SYSTEM_PROMPT },
      { role: 'user', content: buildPlanUserPrompt(dto, undefined, attempt) },
    ];
  }
}

/**
 * 剥离 LLM 常见的 Markdown 代码围栏，提取纯 JSON 文本。
 * 处理 ```json ... ``` 与 ``` ... ``` 两种围栏；无围栏则原样返回（trim）。
 */
export function extractJson(text: string): string {
  if (!text) return text;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : text).trim();
}

/** 取计划/天列表中的首个有效技能类型（AI-206 落库 header/day 用）。 */
function firstSkillType(days: PlanDay[]): StudyPlanSkillType | undefined {
  for (const d of days) {
    if (d.skillType && STUDY_PLAN_SKILL_TYPES.includes(d.skillType)) return d.skillType;
    const fromLesson = d.lessons?.find(
      (l) => l.skillType && STUDY_PLAN_SKILL_TYPES.includes(l.skillType),
    )?.skillType;
    if (fromLesson) return fromLesson;
  }
  return undefined;
}

/** 技能类型 → 任务图标（与种子任务图标口径一致：headphones/mic/pencil）。 */
function iconForSkill(skill: StudyPlanSkillType): string {
  switch (skill) {
    case 'listen':
      return 'headphones';
    case 'speak':
      return 'mic';
    case 'write':
    case 'vocab':
    default:
      return 'pencil';
  }
}

/** 由当日 content（JSON 或文本）生成简短任务描述（AI-206 写入 daily_tasks.description）。 */
function summarizeDay(day: StudyPlanDay): string {
  const raw = day.content || '';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const titles = parsed.map((l: { title?: string }) => l?.title).filter(Boolean);
      if (titles.length) return titles.join(' · ');
    }
  } catch {
    // 非 JSON，按纯文本处理
  }
  return raw.slice(0, 200) || `计划第 ${day.dayIndex + 1} 天`;
}

/** UTC 口径 `YYYY-MM-DD` 加 N 天（AI-206 计划日日期计算，与 task_completions.date 一致）。 */
function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}
