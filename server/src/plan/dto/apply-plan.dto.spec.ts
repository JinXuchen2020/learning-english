import { ValidationPipe } from '@nestjs/common';
import { ApplyPlanDto } from './apply-plan.dto';

/**
 * ApplyPlanDto 校验（AI-206）：confirm 为可选布尔；缺省 → undefined；
 * 非布尔（含字符串）→ 400。
 */

const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

describe('ApplyPlanDto (AI-206)', () => {
  it('缺 confirm → undefined', async () => {
    const dto = (await pipe.transform({}, { type: 'body', metatype: ApplyPlanDto })) as ApplyPlanDto;
    expect(dto.confirm).toBeUndefined();
  });

  it('confirm=true → true', async () => {
    const dto = (await pipe.transform({ confirm: true }, { type: 'body', metatype: ApplyPlanDto })) as ApplyPlanDto;
    expect(dto.confirm).toBe(true);
  });

  it('confirm=false → false', async () => {
    const dto = (await pipe.transform({ confirm: false }, { type: 'body', metatype: ApplyPlanDto })) as ApplyPlanDto;
    expect(dto.confirm).toBe(false);
  });

  it('confirm 非布尔（字符串）→ 400', async () => {
    await expect(
      pipe.transform({ confirm: 'yes' }, { type: 'body', metatype: ApplyPlanDto }),
    ).rejects.toThrow();
  });
});
