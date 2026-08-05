import { validatePlan, PLAN_LESSON_TYPES } from './plan-schema';

/**
 * validatePlan 单测（AI-204）：覆盖结构校验与 lesson 引用格式校验的正常/边界/异常。
 * 纯函数、无 LLM / DB 依赖，直接喂 `JSON.parse` 后的对象。
 */

describe('validatePlan (AI-204)', () => {
  it('合规计划 → ok:true 且返回结构化值', () => {
    const plan = {
      weeks: [
        {
          week: 1,
          days: [
            {
              day: 1,
              skillType: 'vocab',
              title: '颜色',
              lessons: [
                { type: 'main', title: '颜色王国', skillType: 'vocab' },
                { type: 'review', title: '复习' },
                { type: 'review', title: '复习2' },
                { type: 'speaking', title: '跟读' },
              ],
            },
          ],
        },
      ],
    };
    const r = validatePlan(plan);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.value).toBe(plan);
  });

  it('根节点不是对象 → 失败', () => {
    expect(validatePlan('not object').ok).toBe(false);
    expect(validatePlan(42).ok).toBe(false);
    expect(validatePlan(null).ok).toBe(false);
    expect(validatePlan([1, 2, 3]).ok).toBe(false);
  });

  it('weeks 缺失 / 非数组 / 空数组 → 失败', () => {
    expect(validatePlan({}).ok).toBe(false);
    expect(validatePlan({ weeks: 'x' }).ok).toBe(false);
    expect(validatePlan({ weeks: [] }).ok).toBe(false);
  });

  it('week 缺数字字段 → 失败', () => {
    const r = validatePlan({ weeks: [{ days: [] }] });
    expect(r.ok).toBe(false);
    expect(r.errors.join('; ')).toContain('weeks[0].week');
  });

  it('days 缺失 / 非数组 / 空数组 → 失败', () => {
    expect(validatePlan({ weeks: [{ week: 1 }] }).ok).toBe(false);
    expect(validatePlan({ weeks: [{ week: 1, days: 'x' }] }).ok).toBe(false);
    expect(validatePlan({ weeks: [{ week: 1, days: [] }] }).ok).toBe(false);
  });

  it('day 缺数字字段 → 失败', () => {
    const r = validatePlan({ weeks: [{ week: 1, days: [{ lessons: [{ type: 'main' }] }] }] });
    expect(r.ok).toBe(false);
    expect(r.errors.join('; ')).toContain('weeks[0].days[0].day');
  });

  it('lessons 缺失 / 非数组 / 空数组 → 失败', () => {
    expect(validatePlan({ weeks: [{ week: 1, days: [{ day: 1 }] }] }).ok).toBe(false);
    expect(validatePlan({ weeks: [{ week: 1, days: [{ day: 1, lessons: 'x' }] }] }).ok).toBe(false);
    expect(validatePlan({ weeks: [{ week: 1, days: [{ day: 1, lessons: [] }] }] }).ok).toBe(false);
  });

  it('lesson.type 非法 → 失败', () => {
    const r = validatePlan({
      weeks: [{ week: 1, days: [{ day: 1, lessons: [{ type: 'homework' }] }] }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('; ')).toContain('type 非法');
  });

  it('lesson.skillType 非法 → 失败', () => {
    const r = validatePlan({
      weeks: [{ week: 1, days: [{ day: 1, lessons: [{ skillType: 'dance' }] }] }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('; ')).toContain('skillType 非法');
  });

  it('lesson.title 非字符串 → 失败', () => {
    const r = validatePlan({
      weeks: [{ week: 1, days: [{ day: 1, lessons: [{ title: 123 }] }] }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('; ')).toContain('title');
  });

  it('lesson.courseId / lessonId 空字符串 → 失败', () => {
    const r = validatePlan({
      weeks: [{ week: 1, days: [{ day: 1, lessons: [{ courseId: '', lessonId: 'l1' }] }] }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('; ')).toContain('courseId');
  });

  it('lesson 携带合法 courseId/lessonId → 通过', () => {
    const r = validatePlan({
      weeks: [
        {
          week: 1,
          days: [
            { day: 1, lessons: [{ type: 'main', courseId: 'c-1', lessonId: 'l-1' }] },
          ],
        },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it('聚合多层级错误（一次暴露全部问题）', () => {
    const r = validatePlan({
      weeks: [
        { week: 1, days: [{ day: 1, lessons: [{ type: 'bad' }, { skillType: 'bad' }] }] },
        { days: [] },
      ],
    });
    expect(r.ok).toBe(false);
    const joined = r.errors.join('; ');
    expect(joined).toContain('type 非法');
    expect(joined).toContain('skillType 非法');
    expect(joined).toContain('weeks[1].week');
    expect(joined).toContain('weeks[1].days');
  });

  it('PLAN_LESSON_TYPES 包含 main/review/speaking', () => {
    expect(PLAN_LESSON_TYPES).toEqual(['main', 'review', 'speaking']);
  });
});
