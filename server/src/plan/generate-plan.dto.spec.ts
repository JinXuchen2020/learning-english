import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GeneratePlanDto, PLAN_LEVELS } from './dto/generate-plan.dto';

/**
 * DTO 校验单测（AI-202）：逐字段验证合法/非法，确保全局 `ValidationPipe`
 * 对「非法入参」返回 400。覆盖正常路径 + 边界 + 异常分支。
 */

const UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

function build(overrides: Partial<Record<string, unknown>> = {}): GeneratePlanDto {
  const plain = {
    childId: UUID,
    ageRange: '6-8',
    level: 'a1',
    dailyMinutes: 20,
    interests: ['动物', '太空'],
    weeks: 2,
    ...overrides,
  };
  return plainToInstance(GeneratePlanDto, plain);
}

async function errorsOf(plain: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(GeneratePlanDto, plain);
  const errs = await validate(dto);
  return errs.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('GeneratePlanDto (AI-202)', () => {
  it('合法入参零错误', async () => {
    const errs = await validate(build());
    expect(errs).toHaveLength(0);
  });

  it('childId 必须为 uuid v4', async () => {
    const msgs = await errorsOf({ childId: 'not-a-uuid', ageRange: '6-8', level: 'a1', dailyMinutes: 20, interests: ['动物'], weeks: 2 });
    expect(msgs.join(' ')).toMatch(/uuid/i);
  });

  it('ageRange 必须 lo-hi 格式', async () => {
    const msgs = await errorsOf({ childId: UUID, ageRange: 'six', level: 'a1', dailyMinutes: 20, interests: ['动物'], weeks: 2 });
    expect(msgs.join(' ')).toMatch(/ageRange/);
  });

  it('level 必须在枚举内', async () => {
    const msgs = await errorsOf({ childId: UUID, ageRange: '6-8', level: 'c1', dailyMinutes: 20, interests: ['动物'], weeks: 2 });
    expect(msgs.some((m) => /IsIn|one of|level/i.test(m))).toBe(true);
  });

  it('dailyMinutes 越界（<5 或 >120）被拒', async () => {
    const tooSmall = await errorsOf({ childId: UUID, ageRange: '6-8', level: 'a1', dailyMinutes: 1, interests: ['动物'], weeks: 2 });
    const tooBig = await errorsOf({ childId: UUID, ageRange: '6-8', level: 'a1', dailyMinutes: 200, interests: ['动物'], weeks: 2 });
    expect(tooSmall.length).toBeGreaterThan(0);
    expect(tooBig.length).toBeGreaterThan(0);
  });

  it('interests 非空且元素为字符串', async () => {
    const empty = await errorsOf({ childId: UUID, ageRange: '6-8', level: 'a1', dailyMinutes: 20, interests: [], weeks: 2 });
    const badElem = await errorsOf({ childId: UUID, ageRange: '6-8', level: 'a1', dailyMinutes: 20, interests: [123], weeks: 2 });
    expect(empty.length).toBeGreaterThan(0);
    expect(badElem.length).toBeGreaterThan(0);
  });

  it('weeks 越界（<1 或 >4）被拒', async () => {
    const tooSmall = await errorsOf({ childId: UUID, ageRange: '6-8', level: 'a1', dailyMinutes: 20, interests: ['动物'], weeks: 0 });
    const tooBig = await errorsOf({ childId: UUID, ageRange: '6-8', level: 'a1', dailyMinutes: 20, interests: ['动物'], weeks: 6 });
    expect(tooSmall.length).toBeGreaterThan(0);
    expect(tooBig.length).toBeGreaterThan(0);
  });

  it('缺失必填字段被拒', async () => {
    const msgs = await errorsOf({ childId: UUID }); // 仅 childId，其余缺失
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('PLAN_LEVELS 与文档 Pre-A1→A2 一致', () => {
    expect([...PLAN_LEVELS].sort()).toEqual(['a1', 'a2', 'pre-a1'].sort());
  });

  it('useTemplate 缺省零错误（AI-205 可选字段）', async () => {
    const errs = await validate(build());
    expect(errs).toHaveLength(0);
  });

  it('useTemplate 接受布尔', async () => {
    const errs = await validate(build({ useTemplate: true }));
    expect(errs).toHaveLength(0);
    const errs2 = await validate(build({ useTemplate: false }));
    expect(errs2).toHaveLength(0);
  });

  it('useTemplate 非布尔被拒（AI-205 校验）', async () => {
    const msgs = await errorsOf({ childId: UUID, ageRange: '6-8', level: 'a1', dailyMinutes: 20, interests: ['动物'], weeks: 2, useTemplate: 'yes' });
    expect(msgs.length).toBeGreaterThan(0);
  });
});
