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

  // AI-703: 测验变体（组词模式）所需属性。nullable 保持向后兼容（旧词可缺）。
  // 遵循项目约定：nullable 列必须显式 type，否则 better-sqlite3 synchronize 报 DataTypeNotSupportedError。
  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  @Column({ type: 'varchar', nullable: true })
  color: string | null;

  @ManyToOne(() => Lesson, (lesson) => lesson.words, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lessonId' })
  lesson: Lesson;

  @Column()
  lessonId: string;
}
