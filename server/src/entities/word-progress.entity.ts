import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Word } from './word.entity';

/** 单词自适应难度档位（AI-602）。 */
export type WordDifficulty = 'easy' | 'medium' | 'hard';

@Entity('word_progress')
export class WordProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.wordProgress, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @ManyToOne(() => Word, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wordId' })
  word: Word;

  @Column()
  wordId: string;

  @Column({ default: 0 })
  attempts: number;

  @Column({ default: 0 })
  correctCount: number;

  /** 自适应难度档位：随正确率升降（AI-602）。显式 type 避免 reflect-metadata 反射为 Object。 */
  @Column({ type: 'varchar', default: 'easy' })
  difficulty: WordDifficulty;

  /** 掌握度 0-100 = round(correctCount/attempts*100)，未练为 0（AI-602）。 */
  @Column({ type: 'int', default: 0 })
  mastery: number;

  // ===== AI-605 间隔重复（遗忘曲线）状态 =====
  /** 当前复习间隔天数（SM-2 简化）。 */
  @Column({ type: 'int', default: 0 })
  intervalDays: number;

  /** SM-2 易化因子，正确 +0.1 / 错误 -0.2，钳制 [1.3, 3.0]。 */
  @Column({ type: 'float', default: 2.5 })
  easeFactor: number;

  /** 连续正确次数，作为间隔阶梯档位（答错重置为 0）。 */
  @Column({ type: 'int', default: 0 })
  reviewCount: number;

  /** 下一次复习到期日；null = 尚未纳入复习计划（AI-605）。 */
  @Column({ type: 'datetime', nullable: true })
  dueDate: Date | null;

  @UpdateDateColumn({ nullable: true })
  lastPracticedAt: Date;
}
