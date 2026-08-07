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
