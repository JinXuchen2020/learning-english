import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';

describe('RewardsController', () => {
  const rewardsService = {
    listRewards: jest.fn().mockResolvedValue([]),
    getSummary: jest.fn().mockResolvedValue({}),
    listRedemptions: jest.fn().mockResolvedValue([]),
    redeem: jest.fn().mockResolvedValue({}),
    approveRedemption: jest.fn().mockResolvedValue({}),
    rejectRedemption: jest.fn().mockResolvedValue({}),
    createReward: jest.fn().mockResolvedValue({}),
    updateReward: jest.fn().mockResolvedValue({}),
    deleteReward: jest.fn().mockResolvedValue({}),
  } as unknown as jest.Mocked<RewardsService>;
  // 直接实例化绕过 DI；@UseGuards(JwtAuthGuard/ParentGuard) 守卫逻辑由各自单测覆盖，
  // controller 层只验证转发。
  const ctrl = new RewardsController(rewardsService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('list 转发 activeOnly=true（商城上架）', async () => {
    await ctrl.list();
    expect(rewardsService.listRewards).toHaveBeenCalledWith(true);
  });

  it('summary 取 req.user.userId', async () => {
    await ctrl.summary({ user: { userId: 'u1' } } as any);
    expect(rewardsService.getSummary).toHaveBeenCalledWith('u1');
  });

  it('myRedemptions 取 req.user.userId（仅本人）', async () => {
    await ctrl.myRedemptions({ user: { userId: 'u1' } } as any);
    expect(rewardsService.listRedemptions).toHaveBeenCalledWith({ userId: 'u1' });
  });

  it('redeem 转发 userId + rewardId', async () => {
    await ctrl.redeem({ user: { userId: 'u1' } } as any, 'r1');
    expect(rewardsService.redeem).toHaveBeenCalledWith('u1', 'r1');
  });

  it('pending 转发 status 过滤', async () => {
    await ctrl.pending('pending');
    expect(rewardsService.listRedemptions).toHaveBeenCalledWith({ status: 'pending' });
  });

  it('pending 无 status 时转发 undefined', async () => {
    await ctrl.pending(undefined);
    expect(rewardsService.listRedemptions).toHaveBeenCalledWith({ status: undefined });
  });

  it('approve 转发 id', async () => {
    await ctrl.approve('r1');
    expect(rewardsService.approveRedemption).toHaveBeenCalledWith('r1');
  });

  it('reject 转发 id + reason', async () => {
    await ctrl.reject('r1', { reason: 'ok' });
    expect(rewardsService.rejectRedemption).toHaveBeenCalledWith('r1', 'ok');
  });

  it('reject 无 reason 时转发 undefined', async () => {
    await ctrl.reject('r1', {});
    expect(rewardsService.rejectRedemption).toHaveBeenCalledWith('r1', undefined);
  });

  it('create 转发 dto', async () => {
    const dto = { title: '贴纸', pointsCost: 10 } as any;
    await ctrl.create(dto);
    expect(rewardsService.createReward).toHaveBeenCalledWith(dto);
  });

  it('update 转发 id + dto', async () => {
    const dto = { title: '改名' } as any;
    await ctrl.update('r1', dto);
    expect(rewardsService.updateReward).toHaveBeenCalledWith('r1', dto);
  });

  it('remove 转发 id', async () => {
    await ctrl.remove('r1');
    expect(rewardsService.deleteReward).toHaveBeenCalledWith('r1');
  });
});
