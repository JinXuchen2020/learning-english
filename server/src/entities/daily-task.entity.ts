import {
  Entity, PrimaryGeneratedColumn, Column,
} from 'typeorm';

@Entity('daily_tasks')
export class DailyTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column()
  description: string;

  @Column()
  icon: string; // 'headphones' | 'mic' | 'pencil'

  @Column({ default: 0 })
  sortOrder: number;
}
