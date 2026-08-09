import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { DailyTask } from '../entities/daily-task.entity';
import { TaskCompletion } from '../entities/task-completion.entity';
import { StudyPlanDay } from '../plan/study-plan-day.entity';
import { ProgressModule } from '../progress/progress.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DailyTask, TaskCompletion, StudyPlanDay]),
    // AI-605：getDailyTasks 注入到期复习任务需 ProgressService（Tasks → Progress 单向，无环）。
    ProgressModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
  // AI-206：PlanService 需调用 replacePlanTasks 写入计划任务，故导出 TasksService。
  // AI-209：TasksService 回写 study_plan_days.isDone，故在本模块注册 StudyPlanDay 仓库。
  // 注意：仅注册实体仓库（实体类导入），不 import PlanModule，保持 Plan→Tasks 单向依赖无循环。
  exports: [TasksService],
})
export class TasksModule {}
