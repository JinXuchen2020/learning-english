import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgressService } from './progress.service';
import { ProgressController } from './progress.controller';
import { LessonProgress } from '../entities/lesson-progress.entity';
import { WordProgress } from '../entities/word-progress.entity';
import { User } from '../entities/user.entity';
import { RewardsModule } from '../rewards/rewards.module';

@Module({
  imports: [TypeOrmModule.forFeature([LessonProgress, WordProgress, User]), RewardsModule],
  controllers: [ProgressController],
  providers: [ProgressService],
  // AI-605：TasksModule 的 getDailyTasks 需调用 ProgressService.getDueReviews 注入到期复习任务，
  // 故导出 ProgressService（Tasks → Progress 单向依赖，无环）。
  exports: [ProgressService],
})
export class ProgressModule {}
