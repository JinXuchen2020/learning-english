import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { DailyTask } from '../entities/daily-task.entity';
import { TaskCompletion } from '../entities/task-completion.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DailyTask, TaskCompletion])],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
