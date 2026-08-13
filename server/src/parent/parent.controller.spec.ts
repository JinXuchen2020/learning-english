import { ParentController } from './parent.controller';
import { ParentService } from './parent.service';

describe('ParentController (AI-710)', () => {
  const parentService = {
    createChild: jest.fn().mockResolvedValue({ id: 'c1' }),
    claimChild: jest.fn().mockResolvedValue({ id: 'c1' }),
    listChildren: jest.fn().mockResolvedValue([]),
    unlinkChild: jest.fn().mockResolvedValue(undefined),
    setChildProvider: jest.fn().mockResolvedValue({ id: 'c1', hasProviderOverride: true }),
    getChildProviderOptions: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<ParentService>;
  const ctrl = new ParentController(parentService);
  // @UseGuards(ParentGuard) 在类上声明，但这里直接实例化绕过 DI；
  // guard 逻辑由 ParentGuard 自身单测覆盖，controller 层只验证转发。
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
});
