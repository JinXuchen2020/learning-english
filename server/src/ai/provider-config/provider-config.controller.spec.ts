import { ProviderConfigController } from './provider-config.controller';
import { ProviderConfigService } from './provider-config.service';

describe('ProviderConfigController (AI-705)', () => {
  const svc = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    setDefault: jest.fn(),
    testConnectionById: jest.fn(),
  } as any;
  const ctrl = new ProviderConfigController(svc);
  const parentReq = { user: { userId: 'owner-1', role: 'parent' } } as any;

  it('list 用自身 userId 调服务', async () => {
    await ctrl.list(parentReq);
    expect(svc.list).toHaveBeenCalledWith('owner-1');
  });

  it('create 校验 owner', async () => {
    const dto = { name: 'A', type: 'openai-compatible' } as any;
    await ctrl.create(parentReq, dto);
    expect(svc.create).toHaveBeenCalledWith('owner-1', dto);
  });

  it('update 校验 owner + id', async () => {
    const dto = { name: 'B' } as any;
    await ctrl.update(parentReq, 'c1', dto);
    expect(svc.update).toHaveBeenCalledWith('c1', 'owner-1', dto);
  });

  it('remove 校验 owner + id', async () => {
    await ctrl.remove(parentReq, 'c1');
    expect(svc.remove).toHaveBeenCalledWith('c1', 'owner-1');
  });

  it('setDefault 校验 owner + id', async () => {
    await ctrl.setDefault(parentReq, 'c1');
    expect(svc.setDefault).toHaveBeenCalledWith('c1', 'owner-1');
  });

  it('test 校验 owner + id', async () => {
    await ctrl.test(parentReq, 'c1');
    expect(svc.testConnectionById).toHaveBeenCalledWith('c1', 'owner-1');
  });
});
