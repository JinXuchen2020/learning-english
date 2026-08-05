import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudyPlan } from './study-plan.entity';
import { StudyPlanDay } from './study-plan-day.entity';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';
import { TasksModule } from '../tasks/tasks.module';

/**
 * 学习计划模块（AI-201 建表 + AI-202 生成接口 + AI-206 保存/应用）。
 *
 * 注册 `StudyPlan` / `StudyPlanDay` 实体仓库并导出 `TypeOrmModule`，供
 * 消费方（AI-202 生成服务、AI-206 应用服务、AI-208 展示、AI-209 进度）
 * 直接注入 `getRepositoryToken(StudyPlan)` / `getRepositoryToken(StudyPlanDay)`。
 *
 * AI-202/AI-206 在模块内新增 `PlanController` + `PlanService`：
 * - `PlanService` 注入全局 `AiProvider`（`AiModule` 的 `AI_PROVIDER_TOKEN`），
 *   本模块无需 import `AiModule`。
 * - `PlanService` 注入 `TasksService`（来自 `TasksModule`，AI-206 写计划任务到
 *   `daily_tasks`），故本模块 import `TasksModule` 并消费其导出的 `TasksService`。
 * - `PlanService` 导出供 AI-206/AI-208 复用（生成/展示同一编排逻辑）。
 *
 * 非 `@Global()`：属领域模块，按需 import，与 `CoursesModule` 等同级。
 */
@Module({
  imports: [TypeOrmModule.forFeature([StudyPlan, StudyPlanDay]), TasksModule],
  controllers: [PlanController],
  providers: [PlanService],
  exports: [TypeOrmModule, PlanService],
})
export class PlanModule {}
