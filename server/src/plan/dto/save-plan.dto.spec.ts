import { ValidationPipe } from '@nestjs/common';
import { SavePlanDto } from './save-plan.dto';

/**
 * SavePlanDto 校验（AI-206）：childId 必须为 v4 uuid；plan 必填且为对象
 * （内部结构合法性由 PlanService.savePlan 调 validatePlan 兜底，此处只校验形态）。
 */

const UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

describe('SavePlanDto (AI-206)', () => {
  it('合法 childId + plan 对象 → 通过', async () => {
    const dto = (await pipe.transform(
      { childId: UUID, plan: { weeks: [] } },
      { type: 'body', metatype: SavePlanDto },
    )) as SavePlanDto;
    expect(dto.childId).toBe(UUID);
    expect(dto.plan).toBeDefined();
  });

  it('缺 childId → 400', async () => {
    await expect(
      pipe.transform({ plan: {} }, { type: 'body', metatype: SavePlanDto }),
    ).rejects.toThrow();
  });

  it('非 uuid childId → 400', async () => {
    await expect(
      pipe.transform({ childId: 'xyz', plan: {} }, { type: 'body', metatype: SavePlanDto }),
    ).rejects.toThrow();
  });

  it('缺 plan → 400', async () => {
    await expect(
      pipe.transform({ childId: UUID }, { type: 'body', metatype: SavePlanDto }),
    ).rejects.toThrow();
  });

  it('plan 非对象 → 400', async () => {
    await expect(
      pipe.transform({ childId: UUID, plan: 'nope' }, { type: 'body', metatype: SavePlanDto }),
    ).rejects.toThrow();
  });
});
