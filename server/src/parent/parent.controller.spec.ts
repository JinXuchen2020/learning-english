import { ParentController } from './parent.controller';
import { ParentService } from './parent.service';
import {
  ProgressAggregationService,
  ChildProgressDetail,
} from './progress-aggregation.service';
import { NotFoundException } from '@nestjs/common';

describe('ParentController (AI-710 / AI-712)', () => {
  const parentService = {
    createChild: jest.fn().mockResolvedValue({ id: 'c1' }),
    claimChild: jest.fn().mockResolvedValue({ id: 'c1' }),
    listChildren: jest.fn().mockResolvedValue([]),
    unlinkChild: jest.fn().mockResolvedValue(undefined),
    setChildProvider: jest.fn().mockResolvedValue({ id: 'c1', hasProviderOverride: true }),
    getChildProviderOptions: jest.fn().mockResolvedValue([]),
    findOwnedChild: jest.fn(),
  } as unknown as jest.Mocked<ParentService>;
  const progressAggregation = {
    getDashboard: jest.fn(),
    getChildDetail: jest.fn(),
  } as unknown as jest.Mocked<ProgressAggregationService>;
  const ctrl = new ParentController(parentService, progressAggregation);
  // @UseGuards(ParentGuard) 在类上声明，但这里直接实例化绕过 DI；
  // guard 逻辑由 ParentGuard 自身单测覆盖，controller 层只验证转发与越权。
  const parentReq = { user: { userId: 'parent-1', role: 'parent' } } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createChild forwards parentId + dto to service', async () => {
    const dto = { nickname: 'A', username: 'a', password: 'pass' };
    await ctrl.createChild(parentReq, dto as any);
    expect(parentService.createChild).toHaveBeenCalledWith('parent-1', dto);
  });

  it('claimChild forwards parentId + dto to service', async () => {
    const dto = { username: 'kid', password: 'pass' };
    await ctrl.claimChild(parentReq, dto as any);
    expect(parentService.claimChild).toHaveBeenCalledWith('parent-1', dto);
  });

  it('listChildren forwards parentId to service', async () => {
    await ctrl.listChildren(parentReq);
    expect(parentService.listChildren).toHaveBeenCalledWith('parent-1');
  });

  it('unlinkChild forwards parentId + childId to service', async () => {
    await ctrl.unlinkChild(parentReq, 'child-1');
    expect(parentService.unlinkChild).toHaveBeenCalledWith('parent-1', 'child-1');
  });

  it('setChildProvider forwards parentId + childId + dto to service', async () => {
    const dto = { providerConfigId: 'cfg-1' };
    await ctrl.setChildProvider(parentReq, 'child-1', dto as any);
    expect(parentService.setChildProvider).toHaveBeenCalledWith('parent-1', 'child-1', dto);
  });

  it('getChildProviderOptions forwards parentId + childId to service', async () => {
    await ctrl.getChildProviderOptions(parentReq, 'child-1');
    expect(parentService.getChildProviderOptions).toHaveBeenCalledWith('parent-1', 'child-1');
  });

  /* ---------------------- AI-712 dashboard / child progress ---------------------- */

  it('getDashboard forwards parentId to ProgressAggregationService', async () => {
    const dash = [{ childId: 'c1' }];
    (progressAggregation.getDashboard as jest.Mock).mockResolvedValue(dash);
    const result = await ctrl.getDashboard(parentReq);
    expect(progressAggregation.getDashboard).toHaveBeenCalledWith('parent-1');
    expect(result).toBe(dash);
  });

  it('getChildProgress returns detail when child is owned', async () => {
    const child = { id: 'child-1', parentId: 'parent-1' } as any;
    (parentService.findOwnedChild as jest.Mock).mockResolvedValue(child);
    const detail = { summary: { childId: 'child-1' } } as unknown as ChildProgressDetail;
    (progressAggregation.getChildDetail as jest.Mock).mockResolvedValue(detail);
    const result = await ctrl.getChildProgress(parentReq, 'child-1');
    expect(parentService.findOwnedChild).toHaveBeenCalledWith('parent-1', 'child-1');
    expect(progressAggregation.getChildDetail).toHaveBeenCalledWith(child);
    expect(result).toBe(detail);
  });

  it('getChildProgress throws NotFoundException when child is not owned (越权/不存在)', async () => {
    (parentService.findOwnedChild as jest.Mock).mockResolvedValue(null);
    await expect(ctrl.getChildProgress(parentReq, 'child-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(progressAggregation.getChildDetail).not.toHaveBeenCalled();
  });
});
