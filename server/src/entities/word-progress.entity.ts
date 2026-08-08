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

  @UpdateDateColumn({ nullable: true })
  lastPracticedAt: Date;
}
