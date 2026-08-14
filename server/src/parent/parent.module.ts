import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { User } from '../entities/user.entity';
import { ProviderConfig } from '../ai/provider-config/provider-config.entity';
import { StudyPlan } from '../plan/study-plan.entity';
import { StudyPlanDay } from '../plan/study-plan-day.entity';
import { WordProgress } from '../entities/word-progress.entity';
import { Word } from '../entities/word.entity';
import { TaskCompletion } from '../entities/task-completion.entity';
import { ParentService } from './parent.service';
import { ParentController } from './parent.controller';
import { ParentGuard } from './parent.guard';
import { ProgressAggregationService } from './progress-aggregation.service';

/**
 * 家长域模块（AI-702 之后）。
 *
 * `ParentGuard` 校验登录 JWT 的 `role === 'parent'`，不再依赖单独的 PIN 会话 JWT。
 * `ParentGuard` 导出供 `RewardsModule` 等审批/目录 CRUD 端点复用。
 * AI-712 在 `ProgressAggregationService` 注入多张只读聚合所需的实体仓库（零新增表）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      ProviderConfig,
      StudyPlan,
      StudyPlanDay,
      WordProgress,
      Word,
      TaskCompletion,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'fox-english-kids-secret',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [ParentController],
  providers: [ParentService, ParentGuard, ProgressAggregationService],
  exports: [ParentGuard, JwtModule, ProgressAggregationService],
})
export class ParentModule {}
