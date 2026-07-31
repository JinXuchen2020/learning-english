import {
  Entity, PrimaryGeneratedColumn, Column, OneToMany,
} from 'typeorm';
import { Lesson } from './lesson.entity';

@Entity('courses')
export class Course {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column()
  description: string;

  @Column()
  icon: string;

  @Column()
  color: string;

  @Column({ default: 0 })
  sortOrder: number;

  @OneToMany(() => Lesson, (lesson) => lesson.course)
  lessons: Lesson[];
}
