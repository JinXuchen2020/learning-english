import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import { Lesson } from './lesson.entity';

@Entity('words')
export class Word {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  text: string;

  @Column()
  phonics: string;

  @Column()
  meaning: string;

  @Column({ nullable: true })
  illustration: string;

  @Column('simple-array')
  options: string[];

  @Column()
  correctIndex: number;

  @Column({ default: 0 })
  sortOrder: number;

  @ManyToOne(() => Lesson, (lesson) => lesson.words, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lessonId' })
  lesson: Lesson;

  @Column()
  lessonId: string;
}
