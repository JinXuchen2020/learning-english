import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany,
} from 'typeorm';
import { LessonProgress } from './lesson-progress.entity';
import { WordProgress } from './word-progress.entity';
import { TaskCompletion } from './task-completion.entity';

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

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => LessonProgress, (lp) => lp.user)
  lessonProgress: LessonProgress[];

  @OneToMany(() => WordProgress, (wp) => wp.user)
  wordProgress: WordProgress[];

  @OneToMany(() => TaskCompletion, (tc) => tc.user)
  taskCompletions: TaskCompletion[];
}
