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
import { AiProvider, AI_PROVIDER_TOKEN, ChatMessage, ChatOptions, ChatResult } from '../ai/ai-provider.interface';
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
 * 学习计划生成服务（AI-202 编排 + AI-203 双语 PlanAgent 提示词 + AI-204 Schema 校验
 * + AI-206 持久化 save / 应用 apply）。
 *
 * 编排：`GeneratePlanDto` → 组装 chat 消息（system=双语儿科友好 PlanAgent 提示词，
 * user=学习者画像 + 可选课程目录）→ `AiProvider.chat` → 剥离代码围栏 → `validatePlan`
 * 结构校验 → 合规则返回。
 *
 * 错误处理（按需求：出错即抛，不降级模板）：AI 输出非法 JSON / 不符合 Schema /
 * 被 `max_tokens` 截断（`finish_reason==='length'`），或 `AiProvider.chat` 基础设施
 * 异常（超时/限流/鉴权），均**向上抛异常**（`BadRequestException` / provider 原异常），
 * 由 HTTP 层返回 4xx/5xx 暴露真实问题，绝不以 `buildFallbackPlan` 静默掩盖。
 * 单次生成（关闭 thinking + maxTokens 6000 防截断 + 55s 超时 < Vercel 60s）即返回，
 * 不再重试——重试对「输出质量失败」无效且会叠加超时触发 504。
 *
 * 持久化（AI-206）：`savePlan` 将合法 `GeneratedPlan` 落库为 `draft` `StudyPlan`+`StudyPlanDay`；
 * `applyPlan(id)` 将草稿置为 `applied`，按天填 `date` 并写入 `daily_tasks`（经 `TasksService`）。
 *
 * 依赖全局 `AiProvider`（`AiModule` 的 `@Global()` 注入 `AI_PROVIDER_TOKEN`），
 * 因此 `PlanModule` 无需重复 import `AiModule`。`StudyPlan`/`StudyPlanDay` 仓库与
 * `TasksService` 由 `PlanModule` 经 `TypeOrmModule.forFeature` + 导入 `TasksModule` 提供。
 */
@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    @Inject(AI_PROVIDER_TOKEN) private readonly ai: AiProvider,
    @InjectRepository(StudyPlan) private readonly planRepo: Repository<StudyPlan>,
    @InjectRepository(StudyPlanDay) private readonly dayRepo: Repository<StudyPlanDay>,
    private readonly tasksService: TasksService,
  ) {}

  /**
   * 生成学习计划（含 Schema 校验，出错即抛，不降级模板）。
   * @param dto 经 class-validator 校验后的请求体
   * @returns 结构化计划响应（`degraded:false`）
   * @throws 当 AI 输出非法 JSON / 不符合 Schema / 被截断，或 `AiProvider.chat` 抛错时，
   *         均向上抛异常（BadRequestException / provider 原异常），由 HTTP 层暴露真实问题。
   */
  async generatePlan(dto: GeneratePlanDto): Promise<GeneratePlanResponse> {
    // AI-205：用户主动选模板 → 跳过 LLM，直出内置模板计划（非失败态，degraded:false）。
    // 注意：这是用户显式选择，与「出错降级模板」无关；出错路径一律抛异常（见下）。
    if (dto.useTemplate) {
      this.logger.log('[Plan] 用户主动选择模板生成，跳过 LLM，直出内置模板计划');
      return { plan: buildFallbackPlan(dto), model: 'template', degraded: false };
    }

    const messages = this.buildMessages(dto);
    // 关键修复（plan 504 真因）：
    // 1) 关闭推理链 thinking —— 种子 extraBody 的 enable_thinking:true 会产生大量思考 token
    //    并拖慢生成（实测单次 14.9s/37.6s），调用层用同结构 extraBody 覆盖关闭，避免思考
    //    token 占满窗口导致 JSON 被截断 / 逼近 Vercel 60s 上限。
    // 2) maxTokens 提到 6000，使完整计划（约 4000–6000 token）不被截断。
    // 3) timeoutMs 55s < Vercel maxDuration 60s，给解析/审计留余量；maxAttempts:1 快速失败。
    const options: ChatOptions = {
      temperature: 0.4,
      maxTokens: 6000,
      extraBody: { chat_template_kwargs: { enable_thinking: false } },
      timeoutMs: 55_000,
      maxAttempts: 1,
    };

    // provider 基础设施异常（含超时/限流/鉴权）原样向上传播，不在本层吞掉或重试。
    const result: ChatResult = await this.ai.chat(messages, options);

    // 输出被 max_tokens 截断（finish_reason==='length'）→ 明确抛出，提示调参，
    // 不再静默降级模板掩盖问题。
    if (result.finishReason === 'length') {
      this.logger.error(
        '[Plan] AI 输出被 maxTokens 截断（finish_reason=length），未返回完整 JSON；' +
          '请提高 maxTokens 或减小计划规模（周数）',
      );
      throw new BadRequestException({
        message: '学习计划生成失败：模型输出被截断，请稍后重试或减小计划规模（周数）',
        code: 'PLAN_TRUNCATED',
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(result.text));
    } catch {
      this.logger.error('[Plan] AI 返回内容不是合法 JSON：%s', result.text.slice(0, 500));
      throw new BadRequestException({
        message: '学习计划生成失败：模型未返回合法 JSON',
        code: 'PLAN_INVALID_JSON',
      });
    }

    const validation = validatePlan(parsed);
    if (!validation.ok) {
      this.logger.error('[Plan] AI 返回 JSON 不符合学习计划结构：%s', validation.errors.join('; '));
      throw new BadRequestException({
        message: '学习计划生成失败：结构校验未通过',
        errors: validation.errors,
        code: 'PLAN_SCHEMA_INVALID',
      });
    }

    return { plan: validation.value!, model: result.model, degraded: false };
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

  /** 组装 system + user 消息。system 用双语儿科友好 PlanAgent 提示词（AI-203）；user 含学习者画像、可选课程目录。 */
  private buildMessages(dto: GeneratePlanDto): ChatMessage[] {
    return [
      { role: 'system', content: PLAN_SYSTEM_PROMPT },
      { role: 'user', content: buildPlanUserPrompt(dto) },
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
