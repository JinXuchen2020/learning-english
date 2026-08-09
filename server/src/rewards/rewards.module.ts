import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPoints } from './user-points.entity';
import { Reward } from './reward.entity';
import { RewardRedemption } from './reward-redemption.entity';
import { User } from '../entities/user.entity';
import { RewardsService } from './rewards.service';
import { RewardsController } from './rewards.controller';

/**
 * 奖励商城模块（AI-701）。
 *
 * 叶子模块：仅注册自身实体（含 `User` 供 summary 读 `totalStars`），导出 `RewardsService`
 * 供 Progress / Tasks / AI 模块注入以累加积分。不反向依赖其它业务模块，避免循环依赖。
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserPoints, Reward, RewardRedemption, User])],
  controllers: [RewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}
