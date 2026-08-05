import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { DailyTask } from '../entities/daily-task.entity';
import { TaskCompletion } from '../entities/task-completion.entity';

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

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(DailyTask)
    private tasksRepo: Repository<DailyTask>,
    @InjectRepository(TaskCompletion)
    private completionsRepo: Repository<TaskCompletion>,
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

    return tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      icon: task.icon,
      completed: completedIds.has(task.id),
    }));
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

    const existing = await this.completionsRepo.findOne({
      where: { userId, taskId, date: today },
    });
    if (existing) {
      return { success: true, alreadyCompleted: true };
    }

    await this.completionsRepo.save(
      this.completionsRepo.create({ userId, taskId, date: today }),
    );
    return { success: true, alreadyCompleted: false };
  }
}
