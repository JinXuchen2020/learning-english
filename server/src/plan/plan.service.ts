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
import { GeneratePlanResponse, GeneratedPlan, PlanDay, PlanStatusResult, PlanCatalog } from './plan.types';
import { PLAN_SYSTEM_PROMPT, buildPlanUserPrompt } from './plan-agent.prompt';
import { validatePlan } from './plan-schema';
import { buildFallbackPlan } from './plan-template';
import { StudyPlan, StudyPlanSkillType, STUDY_PLAN_SKILL_TYPES } from './study-plan.entity';
import { StudyPlanDay } from './study-plan-day.entity';
import { TasksService, PlanTaskEntry } from '../tasks/tasks.service';
import { CoursesService } from '../courses/courses.service';
import { validateCoursePlan, CoursePlanSpec } from './courses-from-plan.schema';
import { buildFallbackCoursePlan, CourseSpecSeed } from './courses-from-plan.template';
import { COURSE_FROM_PLAN_SYSTEM_PROMPT, buildCourseFromPlanUserPrompt } from './courses-from-plan.prompt';
import { GenerateCoursesResponse } from './plan.types';

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
    private readonly coursesService: CoursesService,
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

    const messages = await this.buildMessages(dto);
    // 关键修复（plan 504 真因）：
    // 1) 关闭推理链 thinking —— 种子 extraBody 的 enable_thinking:true 会产生大量思考 token
    //    并拖慢生成（实测单次 14.9s/37.6s），调用层用同结构 extraBody 覆盖关闭，避免思考
    //    token 占满窗口导致 JSON 被截断 / 逼近 Vercel 60s 上限。
    // 2) maxTokens 提到 8000：提示词已收紧 description（每节≤25字）让多数计划紧凑，
    //    8000 兜底覆盖 4 周完整计划（约 6000–8000 token），避免 finish_reason=length 截断。
    // 3) timeoutMs 55s < Vercel maxDuration 60s，给解析/审计留余量；maxAttempts:1 快速失败。
    //    注：8000 token 按 ~190 tok/s 估算约 42s，仍在 55s 超时内，无 504 风险。
    const options: ChatOptions = {
      temperature: 0.4,
      maxTokens: 8000,
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

    // AI-803：每天按「每节一课」拆成独立 DailyTask（Plan A）。每个 lessonRef 校验
    // 真实存在性：有效 → 写入 courseId/lessonId/skillType（前端可深链）；无效/缺失 →
    // 降级为无深链的通用任务（不整计划失败，符合「保存期容错、生成期严格」）。
    const entries: PlanTaskEntry[] = [];
    let order = 0;
    for (const day of days) {
      const refs = parseLessonRefs(day);
      if (refs.length === 0) {
        entries.push(buildGenericEntry(day, order++, plan.userId));
        continue;
      }
      for (const ref of refs) {
        const valid = ref.lessonId
          ? await this.coursesService.lessonExists(ref.lessonId)
          : false;
        entries.push({
          title: ref.title || day.title,
          description: ref.title || summarizeDay(day),
          icon: iconForSkill((ref.skillType as StudyPlanSkillType) || day.skillType),
          sortOrder: order++,
          userId: plan.userId,
          planDayId: day.id,
          date: day.date!,
          courseId: valid ? ref.courseId || null : null,
          lessonId: valid ? ref.lessonId : null,
          skillType: valid ? (ref.skillType || null) : null,
          source: 'plan',
        });
      }
    }
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
   * 由已保存计划生成配套课程（AI-801）：推导课程规格 → AI 产出结构化课程 →
   * `validateCoursePlan` 校验/重试（≤3 次）→ 仍失败降级内置模板课程（degraded） →
   * 经 `CoursesService.createCourseFromPlan` 事务落库 Course+Lesson+Word。
   *
   * 与 `generatePlan` 的「出错即抛」不同，本方法对**课程生成**采用「重试 + 模板降级」
   * 策略：课程生成是「锦上添花」的写路径，宁可落一门结构合规的模板课程也不 500，
   * 保证「生成配套课程」永远可用（AI 不可达/输出非法均返回 200 + degraded）。
   * 单次 AI 调用 `timeoutMs` 18s、最多 3 次 = 最坏 54s < Vercel 60s，避免 504。
   *
   * @param id 已保存计划 UUID（StudyPlan）
   * @param wordsPerLesson 每节单词数（3..8，缺省 5）
   * @returns 落库课程响应（courseId/title/lessonCount/wordCount/degraded/model）
   * @throws NotFoundException 计划不存在（code: PLAN_NOT_FOUND）
   */
  async generateCoursesForPlan(
    id: string,
    wordsPerLesson = 5,
  ): Promise<GenerateCoursesResponse> {
    const plan = await this.planRepo.findOne({ where: { id }, relations: ['days'] });
    if (!plan) {
      throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: '学习计划不存在' });
    }

    const seed = deriveCourseSpec(plan);
    const options: ChatOptions = {
      temperature: 0.5,
      maxTokens: 4096,
      extraBody: { chat_template_kwargs: { enable_thinking: false } },
      timeoutMs: 18_000,
      maxAttempts: 1,
    };

    let raw: CoursePlanSpec | null = null;
    let degraded = false;
    let model = 'template';

    for (let attempt = 1; attempt <= 3 && !raw; attempt++) {
      try {
        const result = await this.ai.chat(
          [
            { role: 'system', content: COURSE_FROM_PLAN_SYSTEM_PROMPT },
            { role: 'user', content: buildCourseFromPlanUserPrompt(seed, wordsPerLesson, attempt) },
          ],
          options,
        );
        model = result.model ?? model;
        const parsed = JSON.parse(extractJson(result.text));
        const validation = validateCoursePlan(parsed);
        if (validation.ok) {
          raw = validation.value!;
        } else if (attempt === 3) {
          this.logger.warn('[Plan] 课程生成连续 3 次结构校验失败，降级模板课程：%s', validation.errors.join('; '));
        }
      } catch (err) {
        this.logger.warn('[Plan] 课程生成第 %d 次调用失败：%s', attempt, (err as Error).message);
      }
      if (!raw && attempt === 3) {
        raw = buildFallbackCoursePlan(seed, wordsPerLesson);
        degraded = true;
      }
    }

    const created = await this.coursesService.createCourseFromPlan(raw!);
    this.logger.log(
      '[Plan] 已生成配套课程 %s（%d 节 / %d 词，degraded=%s）',
      created.courseId,
      created.lessonCount,
      created.wordCount,
      degraded,
    );
    // AI-803：把生成的课程 id 写回计划 lessons 引用，使后续 applyPlan 能导航到本课。
    // 优雅降级：写回失败仅告警，不影响「课程已生成」主响应。
    await writeBackGeneratedCourse(plan, created.courseId, this.coursesService, this.planRepo, this.logger);
    return {
      courseId: created.courseId,
      title: raw!.course.title,
      lessonCount: created.lessonCount,
      wordCount: created.wordCount,
      degraded,
      model,
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
      // AI-803：把每节 lesson 的引用（courseId/lessonId/skillType/title）提取为可查询索引，
      // 供 applyPlan 按节精准生成 daily_tasks 并校验真实存在性，无需每次解析 content。
      day.lessonRefsJson = JSON.stringify(
        (d.lessons ?? []).map((l) => ({
          skillType: l.skillType ?? null,
          courseId: l.courseId ?? null,
          lessonId: l.lessonId ?? null,
          title: l.title ?? null,
        })),
      );
      day.date = null;
      day.isDone = false;
      return day;
    });
    return studyPlan;
  }

  /**
   * 组装 system + user 消息。system 用双语儿科友好 PlanAgent 提示词（AI-203）；
   * user 含学习者画像 + **真实课程目录**（AI-803 注入，使 AI 产出真实可导航的
   * lessonId/courseId）。目录获取失败（理论上不会，本地库）则降级为「无目录」分支，
   * AI 产出空 id 占位，绝不阻断计划生成。
   */
  private async buildMessages(dto: GeneratePlanDto): Promise<ChatMessage[]> {
    let catalog: PlanCatalog | undefined;
    try {
      catalog = await this.coursesService.getCatalog();
    } catch (err) {
      this.logger.warn('[Plan] 获取课程目录失败，计划将不含真实引用 id：%s', (err as Error).message);
    }
    return [
      { role: 'system', content: PLAN_SYSTEM_PROMPT },
      { role: 'user', content: buildPlanUserPrompt(dto, catalog) },
    ];
  }
}

/**
 * 剥离 LLM 常见的 Markdown 代码围栏，提取纯 JSON 文本。
 * 处理 ```json ... ``` 与 ``` ... ``` 两种围栏；无围栏则原样返回（trim）。
 */
export function extractJson(text: string): string {
  if (!text) return text;
  // 1) 剥离 ```json ... ``` / ``` ... ``` 围栏
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let candidate = (fence ? fence[1] : text).trim();
  // 2) 去除前后散文：取首个 { 或 [ 到最后一个 } 或 ]（模型常输出 "这是计划：{…} 希望喜欢"）
  const firstOpen = candidate.search(/[[{]/);
  const lastClose = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
  if (firstOpen !== -1 && lastClose > firstOpen) {
    candidate = candidate.slice(firstOpen, lastClose + 1);
  }
  // 3) 去除对象/数组内的尾随逗号（{a:1,} / [1,2,]），避免严格 JSON.parse 失败
  candidate = candidate.replace(/,(\s*[}\]])/g, '$1');
  return candidate;
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

/** 计划节引用（AI-803）：从 `lessonRefsJson`/`content` 提取的精简结构。 */
interface LessonRef {
  skillType?: string | null;
  courseId?: string | null;
  lessonId?: string | null;
  title?: string | null;
}

/**
 * 从 `StudyPlanDay` 解析每节引用（AI-803）。优先读 `lessonRefsJson`（结构化索引），
 * 缺失则回退解析 `content`（JSON 化的 lessons）；两者皆空/非法 → 返回空数组（走通用任务）。
 */
function parseLessonRefs(day: StudyPlanDay): LessonRef[] {
  const tryParse = (raw?: string | null): LessonRef[] | null => {
    if (!raw) return null;
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return null;
      return arr.map((l: Record<string, unknown>) => ({
        skillType: (l?.skillType as string) ?? null,
        courseId: (l?.courseId as string) ?? null,
        lessonId: (l?.lessonId as string) ?? null,
        title: (l?.title as string) ?? null,
      }));
    } catch {
      return null;
    }
  };
  const fromRefs = tryParse(day.lessonRefsJson);
  if (fromRefs && fromRefs.length) return fromRefs;
  const fromContent = tryParse(day.content);
  if (fromContent && fromContent.length) return fromContent;
  return [];
}

/** 无引用时的通用计划任务条目（AI-803 兜底：每天 1 条、无深链，保留 AI-206 原行为）。 */
function buildGenericEntry(day: StudyPlanDay, sortOrder: number, userId: string): PlanTaskEntry {
  return {
    title: day.title,
    description: summarizeDay(day),
    icon: iconForSkill(day.skillType),
    sortOrder,
    userId,
    planDayId: day.id,
    date: day.date!,
    source: 'plan',
  };
}

/**
 * AI-803 写回：把 `generateCoursesForPlan` 生成的课程 id 回填到计划每天 lessons 的引用，
 * 使后续 `applyPlan` 能导航到该生成课程的对应课时（计划天 i ↔ 生成课程课时 i，1:1）。
 * 失败仅告警、绝不阻断课程生成主响应。
 */
async function writeBackGeneratedCourse(
  plan: StudyPlan,
  courseId: string,
  coursesService: CoursesService,
  planRepo: Repository<StudyPlan>,
  logger: Logger,
): Promise<void> {
  try {
    const course = await coursesService.findOne(courseId);
    const lessonIds = (course?.lessons ?? []).map((l) => l.id);
    if (lessonIds.length === 0) return;
    const days = (plan.days ?? []).slice().sort((a, b) => a.dayIndex - b.dayIndex);
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const lid = lessonIds[i];
      if (!lid) continue;
      const refs = parseLessonRefs(day);
      const base: LessonRef[] =
        refs.length > 0
          ? refs
          : [{ skillType: day.skillType, courseId: '', lessonId: '', title: day.title }];
      const newRefs = base.map((r) => ({
        skillType: r.skillType || day.skillType,
        courseId,
        lessonId: lid,
        title: r.title || day.title,
      }));
      day.lessonRefsJson = JSON.stringify(newRefs);
    }
    await planRepo.save(plan); // cascade 更新 days（含 lessonRefsJson）
  } catch (err) {
    logger.warn('[Plan] 写回生成课程引用到计划失败（不影响课程生成）：%s', (err as Error).message);
  }
}

/**
 * 由 `StudyPlan`（含 days）推导课程种子（AI-801）。
 *
 * 注意：`StudyPlan` 实体**不持久化** level / interests / week theme（AI-203 设计但断线），
 * 仅存 day 级 `title` 与 `content`（JSON 化的 lessons）。因此：
 *  - `dayTitles` 由每 plan day 的 `title` 清洗（去「第 N 天」尾缀）或回退到当日 content
 *    首 lesson 标题得到，作为每节新课的标题来源；
 *  - `title`/`description` 由 dayTitles 推导的主题拼接；
 *  - `level` 无落库值，默认 `a1`（提示词据此约束词汇适龄度）；
 *  这些偏离已在质量门 docs 中如实说明，不影响「生成可学习的真实课程」主目标。
 */
function deriveCourseSpec(plan: StudyPlan): CourseSpecSeed {
  const days = (plan.days ?? [])
    .slice()
    .sort((a, b) => a.dayIndex - b.dayIndex);
  const dayTitles = days.map((d, i) => cleanDayTitle(d, i));
  const theme = deriveTheme(dayTitles);
  return {
    title: theme ? `${theme} · English` : 'My Learning Plan',
    description: `由你的 ${days.length} 天学习计划生成的专属英语课程`,
    level: 'a1',
    dayTitles,
    daysCount: days.length,
  };
}

/** 清洗某 plan day 的标题：去「第 N 天 / Day N」尾缀，回退取 content 首 lesson 标题。 */
function cleanDayTitle(day: StudyPlanDay, index: number): string {
  const raw = (day.title || '').trim();
  const stripped = raw
    .replace(/\s*[·•]\s*第\s*\d+\s*天\s*$/i, '')
    .replace(/\s*[·•]\s*Day\s*\d+\s*$/i, '')
    .replace(/\s*第\s*\d+\s*天\s*$/i, '')
    .replace(/\s*Day\s*\d+\s*$/i, '')
    .trim();
  if (stripped && !/^(第\s*\d+\s*天|day\s*\d+)$/i.test(stripped)) {
    return stripped;
  }
  const fromContent = firstLessonTitle(day.content);
  if (fromContent) return fromContent;
  return `Day ${index + 1}`;
}

/** 从 day.content（JSON 化的 lessons）取首 lesson 标题（最多 40 字）。 */
function firstLessonTitle(content?: string): string | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length && parsed[0]?.title) {
      return String(parsed[0].title).slice(0, 40);
    }
  } catch {
    // content 非 JSON（纯文本），忽略
  }
  return null;
}

/** 从 dayTitles 推导课程主题（取首个非「Day N / 第 N 天」的标题）。 */
function deriveTheme(dayTitles: string[]): string | null {
  for (const t of dayTitles) {
    if (t && !/^(day\s*\d+|第\s*\d+\s*天)/i.test(t)) return t;
  }
  return null;
}
