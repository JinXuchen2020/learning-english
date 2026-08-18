import { validateCoursePlan } from './courses-from-plan.schema';

/**
 * `validateCoursePlan` 结构校验单测（AI-801）。
 * 覆盖：合法结构、缺 course、lessons 空/缺失、word 字段非法、options 长度/越界。
 */
describe('validateCoursePlan (AI-801)', () => {
  const validBase = {
    course: { title: 'Space English', description: 'A space-themed course', icon: 'book', color: '#6C5CE7' },
    lessons: [
      {
        title: 'Star Words',
        estimatedMinutes: 8,
        words: [
          { text: 'star', phonics: '/stɑːr/', meaning: '星星', options: ['star', 'sun', 'moon', 'sky'], correctIndex: 0 },
        ],
      },
    ],
  };

  it('接受合法结构（含可选 example/exampleTrans 透传）', () => {
    const ok = validateCoursePlan({
      ...validBase,
      lessons: [
        {
          title: 'Star Words',
          words: [
            {
              text: 'star',
              phonics: '/stɑːr/',
              meaning: '星星',
              example: 'The star is bright.',
              exampleTrans: '星星很亮。',
              options: ['star', 'sun', 'moon'],
              correctIndex: 0,
            },
          ],
        },
      ],
    });
    expect(ok.ok).toBe(true);
    expect(ok.value).toBeDefined();
    expect(ok.value!.lessons[0].words[0].example).toBe('The star is bright.');
  });

  it('拒绝非对象根', () => {
    expect(validateCoursePlan(null).ok).toBe(false);
    expect(validateCoursePlan([]).ok).toBe(false);
    expect(validateCoursePlan('x').ok).toBe(false);
  });

  it('拒绝缺 course 或 course 字段非法', () => {
    expect(validateCoursePlan({ lessons: validBase.lessons }).ok).toBe(false);
    expect(validateCoursePlan({ course: {}, lessons: validBase.lessons }).ok).toBe(false);
    expect(
      validateCoursePlan({
        course: { title: '', description: 'd', icon: 'b', color: '#fff' },
        lessons: validBase.lessons,
      }).ok,
    ).toBe(false);
  });

  it('拒绝 lessons 缺失/空', () => {
    expect(validateCoursePlan({ course: validBase.course }).ok).toBe(false);
    expect(validateCoursePlan({ course: validBase.course, lessons: [] }).ok).toBe(false);
  });

  it('拒绝 lesson 缺 title 或 words 空', () => {
    expect(
      validateCoursePlan({ course: validBase.course, lessons: [{ title: '', words: [{ text: 'a', phonics: '/a/', meaning: '甲', options: ['a', 'b'], correctIndex: 0 }] }] }).ok,
    ).toBe(false);
    expect(validateCoursePlan({ course: validBase.course, lessons: [{ title: 'T', words: [] }] }).ok).toBe(false);
  });

  it('拒绝 word 必填缺失', () => {
    expect(
      validateCoursePlan({
        course: validBase.course,
        lessons: [{ title: 'T', words: [{ phonics: '/a/', meaning: '甲', options: ['a', 'b'], correctIndex: 0 }] }],
      }).ok,
    ).toBe(false);
    expect(
      validateCoursePlan({
        course: validBase.course,
        lessons: [{ title: 'T', words: [{ text: 'a', meaning: '甲', options: ['a', 'b'], correctIndex: 0 }] }],
      }).ok,
    ).toBe(false);
    expect(
      validateCoursePlan({
        course: validBase.course,
        lessons: [{ title: 'T', words: [{ text: 'a', phonics: '/a/', options: ['a', 'b'], correctIndex: 0 }] }],
      }).ok,
    ).toBe(false);
  });

  it('拒绝 options 长度越界（<2 或 >4）', () => {
    expect(
      validateCoursePlan({
        course: validBase.course,
        lessons: [{ title: 'T', words: [{ text: 'a', phonics: '/a/', meaning: '甲', options: ['a'], correctIndex: 0 }] }],
      }).ok,
    ).toBe(false);
    expect(
      validateCoursePlan({
        course: validBase.course,
        lessons: [{ title: 'T', words: [{ text: 'a', phonics: '/a/', meaning: '甲', options: ['a', 'b', 'c', 'd', 'e'], correctIndex: 0 }] }],
      }).ok,
    ).toBe(false);
  });

  it('拒绝 correctIndex 越界或非整数', () => {
    expect(
      validateCoursePlan({
        course: validBase.course,
        lessons: [{ title: 'T', words: [{ text: 'a', phonics: '/a/', meaning: '甲', options: ['a', 'b'], correctIndex: 5 }] }],
      }).ok,
    ).toBe(false);
    expect(
      validateCoursePlan({
        course: validBase.course,
        lessons: [{ title: 'T', words: [{ text: 'a', phonics: '/a/', meaning: '甲', options: ['a', 'b'], correctIndex: 1.5 }] }],
      }).ok,
    ).toBe(false);
  });
});
