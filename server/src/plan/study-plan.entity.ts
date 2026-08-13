import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany, JoinColumn, Index,
} from 'typeorm';
import { User } from '../entities/user.entity';
import { StudyPlanDay } from './study-plan-day.entity';

/**
 * 学习计划技能类型（AI-201，M2 学习计划）。
 * 用 varchar + TS 联合类型（与 `AiCallLog.status` 同口径），不用 DB 原生 enum，
 * 保证 sqlite/postgres 双驱动兼容。
 */
export type StudyPlanSkillType = 'vocab' | 'listen' | 'speak' | 'write';

/** 学习计划状态（AI-201）。 */
export type StudyPlanStatus = 'draft' | 'applied' | 'archived';

/** `skill_type` 合法值全集，供 DTO / 校验 / 测试复用。 */
export const STUDY_PLAN_SKILL_TYPES: readonly StudyPlanSkillType[] = [
  'vocab', 'listen', 'speak', 'write',
];

/** `status` 合法值全集，供 DTO / 校验 / 测试复用。 */
export const STUDY_PLAN_STATUSES: readonly StudyPlanStatus[] = [
  'draft', 'applied', 'archived',
];

/**
 * 用户学习计划头表（AI-201，M2 起点）。
 *
 * 一行 = 某用户的一份学习计划（如「4 周听力进阶」）；按天明细在
 * `study_plan_days`（`StudyPlanDay`）。与 `User` 关联并级联删除，
 * 与现有学习进度实体（`lesson_progress`/`word_progress`/`task_completion`）
 * 风格一致（`@ManyToOne` + `@Column userId` + `onDelete: 'CASCADE'`）。
 *
 * 本 feature 仅建表与数据模型；生成（AI-202）、应用落库（AI-206）、
 * 展示（AI-208）、进度回写（AI-209）复用本实体与 `PlanModule` 仓库。
 */
@Entity('study_plans')
export class StudyPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.studyPlans, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 16 })
  skillType: StudyPlanSkillType;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status: StudyPlanStatus;

  @OneToMany(() => StudyPlanDay, (day) => day.plan, { cascade: true })
  days: StudyPlanDay[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true })
  updatedAt: Date;
}
