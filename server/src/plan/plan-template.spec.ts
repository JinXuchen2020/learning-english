import { buildFallbackPlan } from './plan-template';
import { validatePlan } from './plan-schema';
import { GeneratePlanDto } from './dto/generate-plan.dto';

/**
 * buildFallbackPlan 单测（AI-204 降级安全网）：保证产出的结构是合规、可渲染的，
 * 不依赖 LLM / 目录。直接喂 DTO 形状，不做 class-validator 校验。
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

describe('buildFallbackPlan (AI-204)', () => {
  it('产出结构通过 validatePlan（ok:true）', () => {
    const plan = buildFallbackPlan(dto());
    expect(validatePlan(plan).ok).toBe(true);
  });

  it('周数映射为 dto.weeks', () => {
    expect(buildFallbackPlan(dto({ weeks: 3 })).weeks).toHaveLength(3);
    expect(buildFallbackPlan(dto({ weeks: 1 })).weeks).toHaveLength(1);
  });

  it('每周含 7 天，每天含 4 节（1 main + 2 review + 1 speaking）', () => {
    const plan = buildFallbackPlan(dto({ weeks: 2 }));
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
    const plan = buildFallbackPlan(dto({ weeks: 1 }));
    const skills = plan.weeks![0].days!.map((d) => d.skillType);
    expect(skills).toEqual(['vocab', 'listen', 'speak', 'write', 'vocab', 'listen', 'speak']);
  });

  it('主题词融合兴趣与等级', () => {
    const plan = buildFallbackPlan(dto({ interests: ['恐龙'], level: 'a2' }));
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
