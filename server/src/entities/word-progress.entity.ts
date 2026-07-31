import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Word } from './word.entity';

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

  @UpdateDateColumn({ nullable: true })
  lastPracticedAt: Date;
}
