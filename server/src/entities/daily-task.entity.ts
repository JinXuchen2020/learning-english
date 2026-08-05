import {
  Entity, PrimaryGeneratedColumn, Column, Index,
} from 'typeorm';

/**
 * 每日任务目录（`daily_tasks` 表，AI-206 扩展）。
 *
 * 两类行共存：
 *  - **全局种子任务**：`userId IS NULL`（如 seed 写入的「听一听 / 说一说 / 写一写」），
 *    对所有用户可见（`getDailyTasks` 合并返回）。
 *  - **计划任务**（AI-206）：`userId` 非空且 `planDayId`/`date` 非空，归属某用户某计划
 *    某一天；仅在该用户「当天」出现在每日任务列表，且重应用时按 `planDayId` 清理。
 */
@Entity('daily_tasks')
export class DailyTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column()
  description: string;

  @Column()
  icon: string; // 'headphones' | 'mic' | 'pencil'

  @Column({ default: 0 })
  sortOrder: number;

  /**
   * 计划任务归属用户（AI-206）。全局种子任务为 NULL。
   * 用于 `getDailyTasks` 多租户隔离：仅返回 `userId IS NULL` 的全局任务 + 该用户当日计划任务。
   */
  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  userId: string | null;

  /**
   * 关联 `study_plan_days.id`（AI-206）。用于重应用时精准清理「该计划」的旧任务，
   * 避免产生重复行。全局种子任务为 NULL。
   */
  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  planDayId: string | null;

  /**
   * 计划日当天 `YYYY-MM-DD`（AI-206，UTC 口径，与 `task_completions.date` 一致）。
   * 仅当天出现在每日任务列表。全局种子任务为 NULL（每天都可见）。
   */
  @Column({ type: 'varchar', length: 10, nullable: true })
  date: string | null;
}
