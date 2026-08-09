import { NotFoundException } from '@nestjs/common';
import { RewardsService } from './rewards.service';
import { InsufficientPointsException } from './insufficient-points.exception';
import { POINT_RULES } from './points.const';

/**
 * RewardsService 单元测试（AI-701）。
 * 直接构造服务 + 内存假仓库，覆盖：awardStars 三处写入 / spendPoints 余额不足抛错 /
 * redeem 成功与不足 / approve-reject 状态机 / listRewards CRUD / getSummary / seedDefaults 测试环境跳过。
 */
describe('RewardsService (AI-701)', () => {
  let pointsRepo: any;
  let rewardRepo: any;
  let redemptionRepo: any;
  let usersRepo: any;
  let service: RewardsService;

  beforeEach(() => {
    pointsRepo = {
      findOne: jest.fn(),
      create: jest.fn((e: any) => e),
      save: jest.fn(async (e: any) => e),
      increment: jest.fn(async () => undefined),
      decrement: jest.fn(async () => undefined),
    };
    rewardRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((e: any) => e),
      save: jest.fn(async (e: any) => e),
      count: jest.fn(async () => 0),
      delete: jest.fn(async () => ({ affected: 1 })),
    };
    redemptionRepo = {
      create: jest.fn((e: any) => e),
      save: jest.fn(async (e: any) => ({ id: 'rd-1', ...e })),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    usersRepo = {
      findOne: jest.fn(),
      increment: jest.fn(async () => undefined),
      update: jest.fn(async () => undefined),
    };
    service = new RewardsService(pointsRepo, rewardRepo, redemptionRepo, usersRepo);
  });

  describe('awardStars', () => {
    it('累加 totalStars + balance，等级不变时不写 user.level', async () => {
      usersRepo.findOne.mockResolvedValue({ totalStars: 1, level: 1 });
      await service.awardStars('u1', POINT_RULES.LESSON_COMPLETE);
      expect(usersRepo.increment).toHaveBeenCalledWith({ id: 'u1' }, 'totalStars', 1);
      expect(pointsRepo.increment).toHaveBeenCalledWith({ userId: 'u1' }, 'balance', 1);
      expect(usersRepo.update).not.toHaveBeenCalled();
    });

    it('等级跨阈值时回写 user.level', async () => {
      usersRepo.findOne.mockResolvedValue({ totalStars: 50, level: 1 });
      await service.awardStars('u1', 50);
      expect(usersRepo.increment).toHaveBeenCalledWith({ id: 'u1' }, 'totalStars', 50);
      // computeLevel(50) = 2 ≠ 当前 1 → 重算等级
      expect(usersRepo.update).toHaveBeenCalledWith({ id: 'u1' }, { level: 2 });
      expect(pointsRepo.increment).toHaveBeenCalledWith({ userId: 'u1' }, 'balance', 50);
    });

    it('n<=0 直接返回（幂等安全，不写库）', async () => {
      await service.awardStars('u1', 0);
      expect(usersRepo.increment).not.toHaveBeenCalled();
      expect(pointsRepo.increment).not.toHaveBeenCalled();
    });
  });

  describe('spendPoints', () => {
    it('余额不足抛 InsufficientPointsException(400)', async () => {
      pointsRepo.findOne.mockResolvedValue({ userId: 'u1', balance: 0 });
      await expect(service.spendPoints('u1', 5)).rejects.toBeInstanceOf(InsufficientPointsException);
      try {
        await service.spendPoints('u1', 5);
      } catch (err) {
        const e = err as InsufficientPointsException;
        expect(e.getStatus()).toBe(400);
        expect((e.getResponse() as any).code).toBe('INSUFFICIENT_POINTS');
      }
    });

    it('余额充足自减并返回新余额', async () => {
      // 第一次 findOne（getOrCreatePoints）→ 余额 10；扣减后第二次 findOne（回读）→ 余额 5。
      pointsRepo.findOne
        .mockResolvedValueOnce({ userId: 'u1', balance: 10 })
        .mockResolvedValueOnce({ userId: 'u1', balance: 5 });
      const left = await service.spendPoints('u1', 5);
      expect(pointsRepo.decrement).toHaveBeenCalledWith({ userId: 'u1' }, 'balance', 5);
      expect(left).toBe(5);
    });
  });

  describe('listRewards / CRUD', () => {
    it('listRewards 按 active=true 查询，返回仓库结果', async () => {
      const rows = [{ id: 'r1', cost: 5 }, { id: 'r2', cost: 1 }];
      rewardRepo.find.mockResolvedValue(rows);
      const res = await service.listRewards(true);
      expect(rewardRepo.find).toHaveBeenCalledWith({ where: { active: true }, order: { cost: 'ASC' } });
      expect(res).toBe(rows);
    });

    it('createReward 落库新奖励', async () => {
      const saved = { id: 'r9', title: '新奖励', cost: 3, active: true };
      rewardRepo.save.mockResolvedValue(saved);
      const res = await service.createReward({ title: '新奖励', cost: 3 } as any);
      expect(rewardRepo.create).toHaveBeenCalled();
      expect(res).toEqual(saved);
    });

    it('updateReward 改字段并保存', async () => {
      rewardRepo.findOne.mockResolvedValue({ id: 'r1', title: '旧', cost: 1, active: true });
      rewardRepo.save.mockImplementation(async (e: any) => e);
      const res = await service.updateReward('r1', { title: '新', cost: 2 });
      expect(res.title).toBe('新');
      expect(res.cost).toBe(2);
    });

    it('updateReward 找不到抛 NotFoundException', async () => {
      rewardRepo.findOne.mockResolvedValue(null);
      await expect(service.updateReward('nope', { title: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deleteReward 按 affected 返回布尔', async () => {
      rewardRepo.delete.mockResolvedValue({ affected: 1 });
      expect(await service.deleteReward('r1')).toBe(true);
      rewardRepo.delete.mockResolvedValue({ affected: 0 });
      expect(await service.deleteReward('r1')).toBe(false);
    });
  });

  describe('redeem', () => {
    it('兑换成功：扣余额 + 建 pending 兑换单（快照标题/成本）', async () => {
      rewardRepo.findOne.mockResolvedValue({ id: 'rw1', title: '集贴纸一枚', cost: 1, active: true });
      pointsRepo.findOne.mockResolvedValue({ userId: 'u1', balance: 10 });
      const res = await service.redeem('u1', 'rw1');
      expect(pointsRepo.decrement).toHaveBeenCalledWith({ userId: 'u1' }, 'balance', 1);
      expect(redemptionRepo.create).toHaveBeenCalledWith({
        userId: 'u1',
        rewardId: 'rw1',
        rewardTitle: '集贴纸一枚',
        cost: 1,
        status: 'pending',
      });
      expect(res.status).toBe('pending');
      expect(res.rewardTitle).toBe('集贴纸一枚');
    });

    it('余额不足兑换失败（抛 InsufficientPointsException）', async () => {
      rewardRepo.findOne.mockResolvedValue({ id: 'rw1', title: '集贴纸一枚', cost: 5, active: true });
      pointsRepo.findOne.mockResolvedValue({ userId: 'u1', balance: 0 });
      await expect(service.redeem('u1', 'rw1')).rejects.toBeInstanceOf(InsufficientPointsException);
    });

    it('奖励不存在抛 NotFoundException', async () => {
      rewardRepo.findOne.mockResolvedValue(null);
      await expect(service.redeem('u1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listRedemptions', () => {
    it('按 status+userId 过滤并倒序', async () => {
      const rows = [{ id: 'rd1', status: 'pending' as const }];
      redemptionRepo.find.mockResolvedValue(rows);
      const res = await service.listRedemptions({ status: 'pending', userId: 'u1' });
      expect(redemptionRepo.find).toHaveBeenCalledWith({
        where: { status: 'pending', userId: 'u1' },
        order: { createdAt: 'DESC' },
      });
      expect(res).toBe(rows);
    });
  });

  describe('approve / reject', () => {
    it('approve 置 approved + decidedAt', async () => {
      redemptionRepo.findOne.mockResolvedValue({ id: 'rd1', status: 'pending' });
      redemptionRepo.save.mockImplementation(async (e: any) => e);
      const res = await service.approveRedemption('rd1');
      expect(res.status).toBe('approved');
      expect(res.decidedAt).not.toBeNull();
    });

    it('reject 置 rejected + 原因 + decidedAt', async () => {
      redemptionRepo.findOne.mockResolvedValue({ id: 'rd1', status: 'pending' });
      redemptionRepo.save.mockImplementation(async (e: any) => e);
      const res = await service.rejectRedemption('rd1', '今天不行');
      expect(res.status).toBe('rejected');
      expect(res.rejectReason).toBe('今天不行');
      expect(res.decidedAt).not.toBeNull();
    });

    it('审批找不到抛 NotFoundException', async () => {
      redemptionRepo.findOne.mockResolvedValue(null);
      await expect(service.approveRedemption('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getSummary', () => {
    it('聚合余额 + 累计星星 + 等级信息', async () => {
      pointsRepo.findOne.mockResolvedValue({ userId: 'u1', balance: 3 });
      usersRepo.findOne.mockResolvedValue({ totalStars: 1 });
      const res = await service.getSummary('u1');
      expect(res).toEqual({
        balance: 3,
        totalStars: 1,
        level: 1,
        levelInfo: { level: 1, totalStars: 1, levelStars: 1, nextLevelStars: 50, isMaxLevel: false },
      });
    });
  });

  describe('seedDefaults', () => {
    it('测试环境跳过种子（不触碰 rewardRepo.count）', async () => {
      await service.seedDefaults();
      expect(rewardRepo.count).not.toHaveBeenCalled();
    });
  });
});
