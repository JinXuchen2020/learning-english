import { BadRequestException } from '@nestjs/common';
import { AiWordCardController } from './ai-word-card.controller';
import { AiWordCardService } from './ai-word-card.service';

describe('AiWordCardController', () => {
  const service = {
    generate: jest.fn().mockResolvedValue({}),
    list: jest.fn().mockResolvedValue([]),
    approve: jest.fn().mockResolvedValue({}),
    reject: jest.fn().mockResolvedValue({}),
  } as unknown as jest.Mocked<AiWordCardService>;
  // 直接实例化绕过 DI；本控制器未挂 guard（AI-601 注释：鉴权口径与 /api/ai/report/* 一致）。
  const ctrl = new AiWordCardController(service);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generate 转发 dto', async () => {
    const dto = { word: 'cat' } as any;
    await ctrl.generate(dto);
    expect(service.generate).toHaveBeenCalledWith(dto);
  });

  it('list 无 status 时转发 undefined（全量）', async () => {
    await ctrl.list(undefined);
    expect(service.list).toHaveBeenCalledWith(undefined);
  });

  it('list 合法 status 时转发该 status', async () => {
    await ctrl.list('pending');
    expect(service.list).toHaveBeenCalledWith('pending');
  });

  it('list 非法 status 抛 BadRequestException 且不调 service', () => {
    expect(() => ctrl.list('bogus' as any)).toThrow(BadRequestException);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('approve 转发 id + reviewerNote', async () => {
    await ctrl.approve('c1', { reviewerNote: 'ok' });
    expect(service.approve).toHaveBeenCalledWith('c1', 'ok');
  });

  it('approve 无 reviewerNote 时转发 undefined', async () => {
    await ctrl.approve('c1', {});
    expect(service.approve).toHaveBeenCalledWith('c1', undefined);
  });

  it('reject 转发 id + reviewerNote', async () => {
    await ctrl.reject('c1', { reviewerNote: 'no' });
    expect(service.reject).toHaveBeenCalledWith('c1', 'no');
  });
});
