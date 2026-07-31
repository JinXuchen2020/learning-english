import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { DailyTask } from './daily-task.entity';

@Entity('task_completions')
export class TaskCompletion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.taskCompletions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @ManyToOne(() => DailyTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: DailyTask;

  @Column()
  taskId: string;

  @Column()
  date: string; // YYYY-MM-DD

  @CreateDateColumn()
  completedAt: Date;
}
