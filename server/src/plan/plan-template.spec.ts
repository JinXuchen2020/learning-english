import { buildFallbackPlan, resolveTier, TIER_SHORT_MAX, TIER_STANDARD_MAX } from './plan-template';
import { validatePlan } from './plan-schema';
import { GeneratePlanDto } from './dto/generate-plan.dto';

/**
 * plan-template 单测（AI-204 降级安全网 + AI-205 三档模板）。
 * 保证产出的结构合规、可渲染、不依赖 LLM / 目录。直接喂 DTO 形状，不做 class-validator 校验。
 */

const UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

function dto(overrides: Partial<GeneratePlanDto> = {}): GeneratePlanDto {
  return {
    childId: UUID,
    ageRange: '6-8',
    level: 'a1',
    dailyMinutes: 20,
    interests: ['动物'],
    weeks: 2,
    ...overrides,
  } as GeneratePlanDto;
}

describe('resolveTier (AI-205 档位解析)', () => {
  it('按 dailyMinutes 边界映射三档', () => {
    expect(resolveTier(5)).toBe('short');
    expect(resolveTier(TIER_SHORT_MAX)).toBe('short');
    expect(resolveTier(TIER_SHORT_MAX + 1)).toBe('standard');
    expect(resolveTier(TIER_STANDARD_MAX)).toBe('standard');
    expect(resolveTier(TIER_STANDARD_MAX + 1)).toBe('extended');
    expect(resolveTier(120)).toBe('extended');
  });
});

describe('buildFallbackPlan (AI-204 + AI-205)', () => {
  it('产出结构通过 validatePlan（ok:true）', () => {
    const plan = buildFallbackPlan(dto());
    expect(validatePlan(plan).ok).toBe(true);
  });

  it('周数映射为 dto.weeks', () => {
    expect(buildFallbackPlan(dto({ weeks: 3 })).weeks).toHaveLength(3);
    expect(buildFallbackPlan(dto({ weeks: 1 })).weeks).toHaveLength(1);
  });

  it('每周含 7 天，每天含 4 节（standard 档：1 main + 2 review + 1 speaking）', () => {
    const plan = buildFallbackPlan(dto({ weeks: 2, dailyMinutes: 20 }));
    for (const w of plan.weeks!) {
      expect(w.days).toHaveLength(7);
      for (const d of w.days!) {
        expect(d.lessons).toHaveLength(4);
        const types = d.lessons!.map((l) => l.type);
        expect(types).toEqual(['main', 'review', 'review', 'speaking']);
        expect(d.lessons!.every((l) => l.title && l.skillType)).toBe(true);
      }
    }
  });

  it('每日主技能按 vocab/listen/speak/write 循环（技能交错）', () => {
    const plan = buildFallbackPlan(dto({ weeks: 1, dailyMinutes: 20 }));
    const skills = plan.weeks![0].days!.map((d) => d.skillType);
    expect(skills).toEqual(['vocab', 'listen', 'speak', 'write', 'vocab', 'listen', 'speak']);
  });

  it('主题词融合兴趣与等级', () => {
    const plan = buildFallbackPlan(dto({ interests: ['恐龙'], level: 'a2', dailyMinutes: 20 }));
    expect(plan.weeks![0].theme).toContain('恐龙');
    expect(plan.weeks![0].days![0].title).toContain('恐龙');
  });

  it('weeks 越界被收敛（最少 1、最多 8）', () => {
    expect(buildFallbackPlan(dto({ weeks: 0 })).weeks).toHaveLength(1);
    expect(buildFallbackPlan(dto({ weeks: 99 })).weeks).toHaveLength(8);
  });

  it('不引用真实 id（courseId/lessonId 留空，存在性校验属 AI-206）', () => {
    const plan = buildFallbackPlan(dto());
    const anyRef = plan.weeks!.flatMap((w) => w.days!).flatMap((d) => d.lessons!)
      .some((l) => l.courseId || l.lessonId);
    expect(anyRef).toBe(false);
  });
});

describe('buildFallbackPlan 三档 dailyMinutes 适配 (AI-205)', () => {
  it('short 档（≤15min）：每日 2 节（1 主课 + 1 口语），结构合规', () => {
    const plan = buildFallbackPlan(dto({ dailyMinutes: 10, weeks: 1 }));
    const day = plan.weeks![0].days![0];
    expect(day.lessons).toHaveLength(2);
    const types = day.lessons!.map((l) => l.type);
    expect(types).toEqual(['main', 'speaking']);
    expect(day.lessons!.every((l) => l.title && l.skillType)).toBe(true);
    expect(validatePlan(plan).ok).toBe(true);
  });

  it('standard 档（16-45min）：每日 4 节（1 主课 + 2 复习 + 1 口语）', () => {
    const plan = buildFallbackPlan(dto({ dailyMinutes: 30, weeks: 1 }));
    const day = plan.weeks![0].days![0];
    expect(day.lessons).toHaveLength(4);
    const types = day.lessons!.map((l) => l.type);
    expect(types).toEqual(['main', 'review', 'review', 'speaking']);
    const skills = day.lessons!.map((l) => l.skillType);
    expect(skills).toEqual(['vocab', 'vocab', 'listen', 'speak']); // 主课 vocab + 复习 vocab/listen + 口语 speak
    expect(validatePlan(plan).ok).toBe(true);
  });

  it('extended 档（≥46min）：每日 5 节（1 主课 + 3 复习 + 1 口语）', () => {
    const plan = buildFallbackPlan(dto({ dailyMinutes: 60, weeks: 1 }));
    const day = plan.weeks![0].days![0];
    expect(day.lessons).toHaveLength(5);
    const types = day.lessons!.map((l) => l.type);
    expect(types).toEqual(['main', 'review', 'review', 'review', 'speaking']);
    const skills = day.lessons!.map((l) => l.skillType);
    expect(skills).toEqual(['vocab', 'vocab', 'listen', 'write', 'speak']);
    expect(validatePlan(plan).ok).toBe(true);
  });

  it('不同档位每日 lesson 数量随 dailyMinutes 递增', () => {
    const short = buildFallbackPlan(dto({ dailyMinutes: 15 })).weeks![0].days![0].lessons!.length;
    const standard = buildFallbackPlan(dto({ dailyMinutes: 45 })).weeks![0].days![0].lessons!.length;
    const extended = buildFallbackPlan(dto({ dailyMinutes: 46 })).weeks![0].days![0].lessons!.length;
    expect(short).toBe(2);
    expect(standard).toBe(4);
    expect(extended).toBe(5);
  });

  it('extended 档每日含 write 复习（强化档特征）', () => {
    const plan = buildFallbackPlan(dto({ dailyMinutes: 90, weeks: 1 }));
    const skills = plan.weeks![0].days![0].lessons!.map((l) => l.skillType);
    expect(skills).toContain('write');
  });
});
