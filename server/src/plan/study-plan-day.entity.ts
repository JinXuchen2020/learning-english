import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { StudyPlan, StudyPlanSkillType } from './study-plan.entity';

/**
 * 学习计划按天明细表（AI-201，M2）。
 *
 * 一行 = 计划中的某一天（如「第 3 天：2 个复习 + 1 个口语」）。归属
 * `StudyPlan`（`@ManyToOne` + `@Column planId`，级联删除）。`content`
 * 由 AI-202 生成写入（文本/JSON），`isDone` 由 AI-209 进度回写。
 *
 * 设计取舍：本表不冗余存 `userId`，统一经 `planId` → `StudyPlan.userId`
 * 追溯，避免与计划头双写不一致。
 */
@Entity('study_plan_days')
export class StudyPlanDay {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 归属计划 ID（显式列 + 外键，与 StudyPlan.id 同为 uuid）。 */
  @Index()
  @Column({ type: 'uuid' })
  planId: string;

  @ManyToOne(() => StudyPlan, (plan) => plan.days, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'planId' })
  plan: StudyPlan;

  /** 计划内第几天（从 0 或 1 起由业务约定，默认 0）。 */
  @Column({ type: 'int', default: 0 })
  dayIndex: number;

  /** 计划日期 `YYYY-MM-DD`（AI-206 落库时写入）；草稿阶段可为空。 */
  @Column({ type: 'varchar', length: 10, nullable: true })
  date: string | null;

  @Column({ type: 'varchar', length: 16 })
  skillType: StudyPlanSkillType;

  @Column({ type: 'varchar', length: 255, default: '' })
  title: string;

  /** 当日计划内容（文本 / JSON），由 AI-202 生成写入。 */
  @Column({ type: 'text', default: '' })
  content: string;

  @Column({ type: 'boolean', default: false })
  isDone: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true })
  updatedAt: Date;
}
