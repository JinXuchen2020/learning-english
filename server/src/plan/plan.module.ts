import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudyPlan } from './study-plan.entity';
import { StudyPlanDay } from './study-plan-day.entity';

/**
 * 学习计划模块（AI-201）。
 *
 * 注册 `StudyPlan` / `StudyPlanDay` 实体仓库，并导出 `TypeOrmModule` 供
 * 消费方（AI-202 生成服务、AI-206 应用服务、AI-208 展示、AI-209 进度）
 * 直接注入 `getRepositoryToken(StudyPlan)` / `getRepositoryToken(StudyPlanDay)`。
 *
 * 非 `@Global()`：属领域模块，按需 import，与 `CoursesModule` 等同级。
 */
@Module({
  imports: [TypeOrmModule.forFeature([StudyPlan, StudyPlanDay])],
  exports: [TypeOrmModule],
})
export class PlanModule {}
