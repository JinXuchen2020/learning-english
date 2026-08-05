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
  // AI-206：PlanService 需调用 replacePlanTasks 写入计划任务，故导出 TasksService。
  exports: [TasksService],
})
export class TasksModule {}
