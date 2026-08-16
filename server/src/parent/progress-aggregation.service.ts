import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { StudyPlan, StudyPlanSkillType } from '../plan/study-plan.entity';
import { StudyPlanDay } from '../plan/study-plan-day.entity';
import { WordProgress } from '../entities/word-progress.entity';
import { Word } from '../entities/word.entity';
import { TaskCompletion } from '../entities/task-completion.entity';

/**
 * 家长视角的多孩子进度聚合服务（AI-712，M8 家庭仪表盘）。
 *
 * 职责：把已按 `userId` 落库的学习数据，按 `parentId` 聚合为
 * 「家庭总览」所需的只读视图——**零新增表、纯只读查询**，不改写任何行。
 *
 * 设计取舍（数据模型现实约束，见 features/ai-712.md §3/§7）：
 * - `planCompletionRatio`：取该孩子全部 `applied` 计划，按 `study_plan_days.isDone` 求完成度。
 * - `weakWords`：`word_progress` 聚合——按单词分组，错次 = Σ(attempts - correctCount)，
 *   过滤 attempts≥1，按错次降序取 Top10（struct `{word, wrongCount}`，比 AI-502 的纯字符串更可被 UI 下钻）。
 * - `skillMastery`：`lessons` 实体无 `skillType`，**唯一带 skill_type 的进度数据是 `study_plan_days`**，
 *   故按「各 applied 计划的按天明细 skillType」聚合完成度作为该技能的掌握度（语义=该技能计划完成度）。
 * - `weeklyTrend`：近 7 日 `task_completion` 按 `date` 计数，作为每日活跃度（与奖励/星星同源，任务完成即激励），
 *   返回 `{date, stars}`。
 *
 * 所有查询均带 `userId` 过滤，天然租户隔离；多孩场景（少数孩子）下查询量可接受，无 N+1 放大。
 */
@Injectable()
export class ProgressAggregationService {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectRepository(StudyPlan)
    private studyPlanRepo: Repository<StudyPlan>,
    @InjectRepository(StudyPlanDay)
    private studyPlanDayRepo: Repository<StudyPlanDay>,
    @InjectRepository(WordProgress)
    private wordProgressRepo: Repository<WordProgress>,
    @InjectRepository(Word)
    private wordRepo: Repository<Word>,
    @InjectRepository(TaskCompletion)
    private taskCompletionRepo: Repository<TaskCompletion>,
  ) {}

  /** 家庭总览：列出某家长名下全部孩子的进度摘要。 */
  async getDashboard(parentId: string): Promise<ChildProgressSummary[]> {
    const children = await this.usersRepo.find({
      where: { parentId, role: 'child' },
      order: { createdAt: 'ASC' },
    });
    return Promise.all(children.map((c) => this.getChildSummary(c)));
  }

  /** 单孩进度摘要（总览卡片用）。 */
  async getChildSummary(child: User): Promise<ChildProgressSummary> {
    const planCompletionRatio = await this.computePlanCompletion(child.id);
    return {
      childId: child.id,
      nickname: child.nickname,
      level: child.level,
      totalStars: child.totalStars,
      streakDays: child.streakDays,
      planCompletionRatio,
      lastActiveDate: child.lastActiveDate ?? null,
      hasProviderOverride: !!child.childProviderConfigId,
    };
  }

  /** 单孩进度详情（点开卡片后的详情页用）。 */
  async getChildDetail(child: User): Promise<ChildProgressDetail> {
    const summary = await this.getChildSummary(child);
    const [weakWords, skillMastery, weeklyTrend] = await Promise.all([
      this.computeWeakWords(child.id),
      this.computeSkillMastery(child.id),
      this.computeWeeklyTrend(child.id),
    ]);
    return { summary, weakWords, skillMastery, weeklyTrend };
  }

  /**
   * 计划完成度 = 全部 applied 计划的已完天 / 总天（0..1）。
   * 无 applied 计划 → 0。
   */
  private async computePlanCompletion(userId: string): Promise<number> {
    const plans = await this.studyPlanRepo.find({
      where: { userId, status: 'applied' },
      relations: ['days'],
    });
    let total = 0;
    let done = 0;
    for (const plan of plans) {
      for (const day of plan.days ?? []) {
        total += 1;
        if (day.isDone) done += 1;
      }
    }
    return total > 0 ? done / total : 0;
  }

  /**
   * 薄弱单词 Top10：按单词聚合错次（attempts - correctCount），过滤 attempts≥1，降序取前 10。
   * 错次 = 0 的单词（全对）不计入弱项。
   */
  private async computeWeakWords(userId: string): Promise<WeakWord[]> {
    const rows = await this.wordProgressRepo.find({
      where: { userId },
      relations: ['word'],
    });
    const agg = new Map<string, { word: string; wrongCount: number }>();
    for (const r of rows) {
      if (r.attempts < 1) continue;
      const wrong = r.attempts - r.correctCount;
      if (wrong <= 0) continue;
      const word = r.word?.text || r.wordId;
      const existing = agg.get(word);
      if (existing) existing.wrongCount += wrong;
      else agg.set(word, { word, wrongCount: wrong });
    }
    return Array.from(agg.values())
      .sort((a, b) => b.wrongCount - a.wrongCount)
      .slice(0, 10);
  }

  /**
   * 技能掌握度：按 skillType 聚合 applied 计划按天明细的完成度。
   * 仅 AI-201/202 计划头带 skillType，按天明细 `StudyPlanDay.skillType` 是进度侧唯一带类型的字段。
   * 无 applied 计划 → 空数组。
   */
  private async computeSkillMastery(userId: string): Promise<SkillMastery[]> {
    const plans = await this.studyPlanRepo.find({
      where: { userId, status: 'applied' },
      relations: ['days'],
    });
    const totals = new Map<StudyPlanSkillType, { total: number; done: number }>();
    for (const plan of plans) {
      for (const day of plan.days ?? []) {
        const cur = totals.get(day.skillType) || { total: 0, done: 0 };
        cur.total += 1;
        if (day.isDone) cur.done += 1;
        totals.set(day.skillType, cur);
      }
    }
    return Array.from(totals.entries()).map(([skillType, v]) => ({
      skillType,
      ratio: v.total > 0 ? v.done / v.total : 0,
    }));
  }

  /** 近 7 日每日活跃度（完成任务数），作为 weeklyTrend.stars。 */
  private async computeWeeklyTrend(userId: string): Promise<WeeklyTrendPoint[]> {
    const days = lastSevenUtcDays();
    const points = await Promise.all(
      days.map(async (date) => {
        const stars = await this.taskCompletionRepo.count({
          where: { userId, date },
        });
        return { date, stars };
      }),
    );
    return points;
  }
}

/* ----------------------------- 类型定义 ----------------------------- */

/** 孩子进度摘要（总览卡片）。 */
export interface ChildProgressSummary {
  childId: string;
  nickname: string;
  level: number;
  totalStars: number;
  streakDays: number;
  /** 计划完成度 0..1（全部 applied 计划按天明细 isDone 比例）。 */
  planCompletionRatio: number;
  /** 最近活跃日期 YYYY-MM-DD，无则为 null。 */
  lastActiveDate: string | null;
  /** 是否使用独立 AI provider 覆盖（AI-711）。 */
  hasProviderOverride: boolean;
}

/** 薄弱单词（含错次，供 UI 下钻到练习）。 */
export interface WeakWord {
  word: string;
  wrongCount: number;
}

/** 技能掌握度（按 skillType 的完成度比例，0..1）。 */
export interface SkillMastery {
  skillType: StudyPlanSkillType;
  ratio: number;
}

/** 周趋势点（近 7 日每日活跃度）。 */
export interface WeeklyTrendPoint {
  date: string; // YYYY-MM-DD
  stars: number;
}

/** 单孩进度详情（点开卡片后的详情页）。 */
export interface ChildProgressDetail {
  summary: ChildProgressSummary;
  weakWords: WeakWord[];
  skillMastery: SkillMastery[];
  weeklyTrend: WeeklyTrendPoint[];
}

/** 返回 UTC 口径的近 7 日（含今日）日期数组，升序。 */
function lastSevenUtcDays(): string[] {
  const out: string[] = [];
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - i);
    out.push(d.toISOString().split('T')[0]);
  }
  return out;
}
