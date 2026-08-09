import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { DailyTask } from '../entities/daily-task.entity';
import { TaskCompletion } from '../entities/task-completion.entity';
import { StudyPlanDay } from '../plan/study-plan-day.entity';
import { AiReportService } from '../ai/ai-report.service';
import { ProgressService } from '../progress/progress.service';
import { RewardsService } from '../rewards/rewards.service';
import { POINT_RULES } from '../rewards/points.const';
import { logger } from '../common/logger/logger';

/** 计划任务写入条目（AI-206 apply 时由 PlanService 组装）。 */
export interface PlanTaskEntry {
  title: string;
  description: string;
  icon: string;
  sortOrder: number;
  userId: string;
  planDayId: string;
  date: string;
}

/** 当日任务返回给前端的视图模型（含 AI-605 注入的复习项）。 */
export interface DailyTaskView {
  id: string;
  title: string;
  description: string;
  icon: string;
  completed: boolean;
  /** AI-605：注入的到期复习项携带原词文本，前端据此渲染为 /practice?focusWord= 深链。 */
  reviewWordText?: string;
}

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(DailyTask)
    private tasksRepo: Repository<DailyTask>,
    @InjectRepository(TaskCompletion)
    private completionsRepo: Repository<TaskCompletion>,
    @InjectRepository(StudyPlanDay)
    private dayRepo: Repository<StudyPlanDay>,
    private aiReportService: AiReportService,
    private progressService: ProgressService,
    private rewardsService: RewardsService,
  ) {}

  /**
   * 返回某用户「当日」每日任务列表（AI-206 多租户合并）。
   *
   * 合并两类行：
   *  - 全局种子任务（`userId IS NULL`，对所有用户每天都可见，如 seed 的听/说/写）。
   *  - 该用户的计划任务（`userId = 该用户 AND date = 今天`），仅当天可见。
   * 两者按 `sortOrder` 升序；完成态由 `task_completions` 当日记录判定。
   */
  async getDailyTasks(userId: string) {
    const today = new Date().toISOString().split('T')[0];

    const tasks = await this.tasksRepo.find({
      where: [{ userId: IsNull() }, { userId, date: today }],
      order: { sortOrder: 'ASC' },
    });

    const completions = await this.completionsRepo.find({
      where: { userId, date: today },
    });
    const completedIds = new Set(completions.map((c) => c.taskId));

    const base: DailyTaskView[] = tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      icon: task.icon,
      completed: completedIds.has(task.id),
    }));

    // AI-605：把「到期/今日待复习」单词作为复习任务注入当日任务列表（不落库，现场附加）。
    // 失败仅告警、绝不阻断主任务列表返回。复习项以 Link 形式进入 /practice?focusWord=X。
    try {
      const due = await this.progressService.getDueReviews(userId);
      for (const r of due) {
        base.push({
          id: `review:${r.wordId}`,
          title: r.wordText,
          description: `复习：${r.meaning}`,
          icon: 'review',
          completed: false,
          reviewWordText: r.wordText,
        });
      }
    } catch (err) {
      logger.warn('[AI-605] 注入到期复习任务失败（不影响主任务列表）', err as Error);
    }

    return base;
  }

  /**
   * 用计划任务替换某计划的旧任务（AI-206 apply 的核心写入）。
   *
   * 先删除该用户「该计划」的旧 `daily_tasks`（按 `planDayId IN (...)`），再批量插入新任务，
   * 保证重应用不会产生重复行；关联 `task_completions` 经 `onDelete CASCADE` 一并清理。
   *
   * @param userId 计划归属用户
   * @param planDayIds 本计划所有 `study_plan_days.id`（用于精准清理旧任务）
   * @param entries 新的计划任务条目
   */
  async replacePlanTasks(
    userId: string,
    planDayIds: string[],
    entries: PlanTaskEntry[],
  ): Promise<void> {
    if (planDayIds.length > 0) {
      await this.tasksRepo.delete({ userId, planDayId: In(planDayIds) });
    }
    if (entries.length > 0) {
      await this.tasksRepo.save(entries.map((e) => this.tasksRepo.create(e)));
    }
  }

  async completeTask(userId: string, taskId: string) {
    const today = new Date().toISOString().split('T')[0];

    // AI-209：计划任务完成 → 回写对应 study_plan_days.isDone（幂等：重复完成无害）。
    // 全局种子任务 planDayId 为空，不受影响。
    const task = await this.tasksRepo.findOne({ where: { id: taskId } });
    if (task?.planDayId) {
      await this.dayRepo.update({ id: task.planDayId }, { isDone: true });
    }

    const existing = await this.completionsRepo.findOne({
      where: { userId, taskId, date: today },
    });
    if (existing) {
      return { success: true, alreadyCompleted: true };
    }

    await this.completionsRepo.save(
      this.completionsRepo.create({ userId, taskId, date: today }),
    );

    // AI-701：新完成任务累加积分（best-effort，与 maybeTriggerReport 同口径）。
    try {
      await this.rewardsService.awardStars(userId, POINT_RULES.TASK_COMPLETE);
    } catch (err) {
      logger.warn('[TASKS] 完成任务累加积分失败（不影响主流程）', err as Error);
    }

    // AI-505（Trigger A）：本次为新完成 → 检查是否「当日全部任务已完成」，是则自动触发生成每日报告。
    // 副作用：失败仅告警，绝不阻塞任务完成主流程。
    await this.maybeTriggerReport(userId);

    return { success: true, alreadyCompleted: false };
  }

  /**
   * AI-505 Trigger A：若用户「当日全部任务已完成」（且至少有一条任务），
   * 自动调 `AiReportService.generateDailyReport` 生成当天报告。
   * 幂等由 AI-502 保证（同日已有报告直接返回，不重复生成）。
   * 整段 try/catch：报告生成（含可能的 AI 调用）失败不影响任务完成响应。
   */
  private async maybeTriggerReport(userId: string): Promise<void> {
    try {
      const tasks = await this.getDailyTasks(userId);
      if (tasks.length > 0 && tasks.every((t) => t.completed)) {
        await this.aiReportService.generateDailyReport(userId);
      }
    } catch (err) {
      logger.warn('[AI-505] 完成任务后自动生成报告失败（不影响任务完成）', err as Error);
    }
  }
}
