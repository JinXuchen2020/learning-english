import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPoints } from './user-points.entity';
import { Reward } from './reward.entity';
import { RewardRedemption, RedemptionStatus } from './reward-redemption.entity';
import { User } from '../entities/user.entity';
import {
  computeLevel,
  buildLevelInfo,
  MascotLevelInfo,
} from '../ai/mascot-level.util';
import { CreateRewardDto } from './dto/create-reward.dto';
import { UpdateRewardDto } from './dto/update-reward.dto';
import { InsufficientPointsException } from './insufficient-points.exception';
import { POINT_RULES } from './points.const';
import { logger } from '../common/logger/logger';

/** 测试环境跳过种子（jest 设 NODE_ENV=test / JEST_WORKER_ID）。 */
const skipSeed = (): boolean =>
  process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;

/** 内置奖励（目录为空时种子插入，成本由低到高便于 E2E 用 1 分奖励）。 */
const DEFAULT_REWARDS: Omit<Reward, 'id' | 'createdAt' | 'updatedAt' | 'active'>[] = [
  { emoji: '⭐', title: '集贴纸一枚', cost: 1, description: '收集一枚小狐贴纸' },
  { emoji: '📖', title: '多讲一个睡前故事', cost: 5, description: '睡前多听一个故事' },
  { emoji: '🍦', title: '选一次冰淇淋口味', cost: 8, description: '今天由你选冰淇淋口味' },
  { emoji: '🎮', title: '多玩 10 分钟', cost: 12, description: '多玩 10 分钟喜欢的活动' },
  { emoji: '🌙', title: '晚睡 15 分钟', cost: 20, description: '今晚晚睡 15 分钟' },
];

/**
 * 积分 / 星星 / 奖励商城服务（AI-701）。
 *
 * 单一真相：`awardStars` 同时累加 `User.totalStars`（驱动等级）+ `user_points.balance`
 * （可消费）；兑换仅扣 `balance`。`RewardsModule` 为叶子模块，Progress/Tasks/AI 注入本服务。
 */
@Injectable()
export class RewardsService implements OnModuleInit {
  constructor(
    @InjectRepository(UserPoints)
    private pointsRepo: Repository<UserPoints>,
    @InjectRepository(Reward)
    private rewardRepo: Repository<Reward>,
    @InjectRepository(RewardRedemption)
    private redemptionRepo: Repository<RewardRedemption>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
  ) {}

  onModuleInit(): void {
    // 启动种子：目录为空时插入内置奖励（测试环境跳过）。
    void this.seedDefaults();
  }

  /** 每用户一行：无则建 0 余额行。 */
  async getOrCreatePoints(userId: string): Promise<UserPoints> {
    let row = await this.pointsRepo.findOne({ where: { userId } });
    if (!row) {
      row = this.pointsRepo.create({ userId, balance: 0 });
      row = await this.pointsRepo.save(row);
    }
    return row;
  }

  async getBalance(userId: string): Promise<number> {
    const row = await this.getOrCreatePoints(userId);
    return row.balance;
  }

  /**
   * 积分 / 星星单一入口：`totalStars += n`（等级随之重算）+ `user_points.balance += n`。
   * `n<=0` 直接返回（幂等安全）。内部错误向上抛，由调用方决定降级。
   */
  async awardStars(userId: string, n: number): Promise<void> {
    if (!Number.isFinite(n) || n <= 0) return;
    await this.usersRepo.increment({ id: userId }, 'totalStars', n);
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (user) {
      const newLevel = computeLevel(user.totalStars);
      if (newLevel !== (user.level ?? 1)) {
        await this.usersRepo.update({ id: userId }, { level: newLevel });
      }
    }
    await this.pointsRepo.increment({ userId }, 'balance', n);
  }

  /** 消费积分：余额不足抛 {@link InsufficientPointsException}。 */
  async spendPoints(userId: string, n: number): Promise<number> {
    const row = await this.getOrCreatePoints(userId);
    if (row.balance < n) {
      throw new InsufficientPointsException(row.balance, n);
    }
    await this.pointsRepo.decrement({ userId }, 'balance', n);
    const updated = await this.pointsRepo.findOne({ where: { userId } });
    return updated?.balance ?? 0;
  }

  async listRewards(activeOnly = true): Promise<Reward[]> {
    return this.rewardRepo.find({
      where: activeOnly ? { active: true } : {},
      order: { cost: 'ASC' },
    });
  }

  async createReward(dto: CreateRewardDto): Promise<Reward> {
    const reward = this.rewardRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      cost: dto.cost,
      emoji: dto.emoji ?? null,
      active: true,
    });
    return this.rewardRepo.save(reward);
  }

  async updateReward(id: string, dto: UpdateRewardDto): Promise<Reward> {
    const reward = await this.rewardRepo.findOne({ where: { id } });
    if (!reward) throw new NotFoundException('奖励不存在');
    if (dto.title !== undefined) reward.title = dto.title;
    if (dto.description !== undefined) reward.description = dto.description ?? null;
    if (dto.cost !== undefined) reward.cost = dto.cost;
    if (dto.emoji !== undefined) reward.emoji = dto.emoji ?? null;
    if (dto.active !== undefined) reward.active = dto.active;
    return this.rewardRepo.save(reward);
  }

  async deleteReward(id: string): Promise<boolean> {
    const result = await this.rewardRepo.delete({ id });
    return (result.affected ?? 0) > 0;
  }

  /** 孩子申请兑换：扣余额 + 建 pending 兑换单（快照标题/成本）。 */
  async redeem(userId: string, rewardId: string): Promise<RewardRedemption> {
    const reward = await this.rewardRepo.findOne({ where: { id: rewardId } });
    if (!reward) throw new NotFoundException('奖励不存在');
    if (!reward.active) throw new NotFoundException('奖励已下架');
    await this.spendPoints(userId, reward.cost);
    const redemption = this.redemptionRepo.create({
      userId,
      rewardId: reward.id,
      rewardTitle: reward.title,
      cost: reward.cost,
      status: 'pending',
    });
    return this.redemptionRepo.save(redemption);
  }

  async listRedemptions(
    opts: { status?: RedemptionStatus; userId?: string } = {},
  ): Promise<RewardRedemption[]> {
    const where: Record<string, unknown> = {};
    if (opts.status) where.status = opts.status;
    if (opts.userId) where.userId = opts.userId;
    return this.redemptionRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  private async decide(
    id: string,
    status: RedemptionStatus,
    rejectReason?: string,
  ): Promise<RewardRedemption> {
    const redemption = await this.redemptionRepo.findOne({ where: { id } });
    if (!redemption) throw new NotFoundException('兑换记录不存在');
    redemption.status = status;
    redemption.decidedAt = new Date();
    if (status === 'rejected') redemption.rejectReason = rejectReason ?? null;
    return this.redemptionRepo.save(redemption);
  }

  approveRedemption(id: string): Promise<RewardRedemption> {
    return this.decide(id, 'approved');
  }

  rejectRedemption(id: string, reason?: string): Promise<RewardRedemption> {
    return this.decide(id, 'rejected', reason);
  }

  /** 商城概览（驱动前端余额 / 等级环）。 */
  async getSummary(
    userId: string,
  ): Promise<{ balance: number; totalStars: number; level: number; levelInfo: MascotLevelInfo }> {
    const row = await this.getOrCreatePoints(userId);
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    const totalStars = user?.totalStars ?? 0;
    const level = computeLevel(totalStars);
    return {
      balance: row.balance,
      totalStars,
      level,
      levelInfo: buildLevelInfo(totalStars, level),
    };
  }

  /** 启动种子：目录为空时插入内置奖励（测试环境跳过，失败仅告警不阻断启动）。 */
  async seedDefaults(): Promise<void> {
    if (skipSeed()) return;
    try {
      const count = await this.rewardRepo.count();
      if (count > 0) return;
      await this.rewardRepo.save(DEFAULT_REWARDS.map((r) => this.rewardRepo.create(r)));
    } catch (err) {
      logger.warn('[REWARDS] 种子奖励失败（不影响启动）', err as Error);
    }
  }
}
