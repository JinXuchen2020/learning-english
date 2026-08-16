import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany,
} from 'typeorm';
import { LessonProgress } from './lesson-progress.entity';
import { WordProgress } from './word-progress.entity';
import { TaskCompletion } from './task-completion.entity';
import { StudyPlan } from '../plan/study-plan.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string;

  @Column({ default: 'Fox Friend' })
  nickname: string;

  @Column({ default: 0 })
  totalStars: number;

  /**
   * 用户等级（AI-603 吉祥物成长剧情驱动）。
   * 由累计星星 totalStars 推导，在 ProgressService.completeLesson 星星 +1 后重算并更新；
   * 持久化避免每次重算，单一真相来自 `computeLevel(totalStars)`。
   */
  @Column({ type: 'int', default: 1 })
  level: number;

  @Column({ default: 0 })
  streakDays: number;

  @Column({ nullable: true })
  lastActiveDate: string; // YYYY-MM-DD

  /**
   * 家长邮箱（AI-506 家长周报收件人）。
   * 可空：未配置家长邮箱的用户在每周扫描中被安全跳过；
   * 自助设置入口留待 AI-702 家长模式（PIN 锁面板）提供。
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  parentEmail: string | null;

  /**
   * 家长归属（AI-705）。儿童 → 家长 `User.id`，用于把儿童发起的 AI 请求
   * 解析到其家长的默认 provider；向前兼容：初始全 null（解析器遇 null 回退 env 默认）。
   * 家庭绑定 UX（家长认领儿童）超出 AI-705 范围。
   */
  @Column({ type: 'uuid', nullable: true })
  parentId: string | null;

  /**
   * 孩子独立 AI provider 覆盖（AI-711）。
   * 指向 `provider_configs.id`，必须归属该孩子的家长（应用层校验，非物理外键）。
   * 为空（默认）→ 孩子 AI 请求回退家长 `isDefault`（AI-705/710 逻辑）。
   * 向前兼容：初始全 null（零回归）。
   */
  @Column({ type: 'uuid', nullable: true })
  childProviderConfigId: string | null;

  /**
   * 账号角色（AI-707 角色化导航）。
   * 'child' = 孩子端（学习功能）；'parent' = 家长端（周报 / 家长中心）。
   * 注册时由客户端选择并落库；登录 JWT 携带 `role` 供前端分流，
   * 同时驱动 AI provider 上下文路由（child → 解析 parentId 到家长默认 provider）。
   */
  @Column({ type: 'varchar', default: 'child' })
  role: 'child' | 'parent';

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => LessonProgress, (lp) => lp.user)
  lessonProgress: LessonProgress[];

  @OneToMany(() => WordProgress, (wp) => wp.user)
  wordProgress: WordProgress[];

  @OneToMany(() => TaskCompletion, (tc) => tc.user)
  taskCompletions: TaskCompletion[];

  @OneToMany(() => StudyPlan, (sp) => sp.user)
  studyPlans: StudyPlan[];
}
