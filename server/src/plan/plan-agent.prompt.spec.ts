import { PLAN_SYSTEM_PROMPT, buildPlanUserPrompt } from './plan-agent.prompt';
import { GeneratePlanDto } from './dto/generate-plan.dto';
import { PlanCatalog } from './plan.types';

/** 构造一个通过类型校验的学习者画像（本测试只消费字段，不做 class-validator 校验）。 */
function sampleDto(): GeneratePlanDto {
  return {
    childId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    ageRange: '6-8',
    level: 'a1',
    dailyMinutes: 30,
    interests: ['动物', '太空'],
    weeks: 2,
  } as GeneratePlanDto;
}

function sampleCatalog(): PlanCatalog {
  return {
    courses: [{ courseId: 'c-0001', title: 'Animals' }],
    lessons: [
      {
        lessonId: 'l-0001',
        title: 'Farm Animals',
        courseId: 'c-0001',
        skillType: 'vocab',
        level: 'a1',
        estimatedMinutes: 10,
      },
    ],
  };
}

describe('PLAN_SYSTEM_PROMPT (AI-203)', () => {
  it('是非空字符串', () => {
    expect(typeof PLAN_SYSTEM_PROMPT).toBe('string');
    expect(PLAN_SYSTEM_PROMPT.length).toBeGreaterThan(200);
  });

  it('是双语的（含中文与英文关键词）', () => {
    expect(PLAN_SYSTEM_PROMPT).toMatch(/[一-龥]/); // 含中文
    expect(PLAN_SYSTEM_PROMPT.toLowerCase()).toMatch(/vocabulary|english/); // 含英文术语
  });

  it('包含内容安全红线（超龄/暴力/危险/不当价值观等）', () => {
    const p = PLAN_SYSTEM_PROMPT;
    ['暴力', '恐怖', '成人', '危险', '政治', '宗教', '姓名', '联系方式', '屏幕'].forEach(
      (kw) => expect(p).toContain(kw),
    );
  });

  it('规定每日结构：1 主课 + 2 复习 + 1 口语', () => {
    const p = PLAN_SYSTEM_PROMPT.toLowerCase();
    expect(p).toContain('main');
    expect(p).toContain('review');
    expect(p).toContain('speaking');
    expect(p).toMatch(/1\s*主课|1 节主课/);
    expect(p).toMatch(/2\s*个?复习|2 个复习/);
    expect(p).toMatch(/1\s*个?口语|1 个口语/);
  });

  it('要求间隔复习（spaced review）', () => {
    expect(PLAN_SYSTEM_PROMPT).toContain('间隔复习');
  });

  it('要求技能交错，覆盖 vocab/listen/speak/write 四类', () => {
    const p = PLAN_SYSTEM_PROMPT.toLowerCase();
    expect(p).toContain('vocabulary');
    expect(p).toContain('listening');
    expect(p).toContain('speaking');
    expect(p).toContain('writing');
  });

  it('要求仅输出 JSON（无解释/无 Markdown 围栏）', () => {
    expect(PLAN_SYSTEM_PROMPT).toContain('只输出 JSON');
    expect(PLAN_SYSTEM_PROMPT).toContain('Markdown');
  });

  it('要求引用真实 courseId/lessonId（UUID），禁止编造', () => {
    const p = PLAN_SYSTEM_PROMPT;
    expect(p).toContain('courseId');
    expect(p).toContain('lessonId');
    expect(p).toContain('真实');
    expect(p).toContain('UUID');
    expect(p).toContain('编造');
  });

  it('重申低 temperature（稳定少随机）', () => {
    expect(PLAN_SYSTEM_PROMPT.toLowerCase()).toContain('temperature');
    expect(PLAN_SYSTEM_PROMPT).toContain('低');
  });
});

describe('buildPlanUserPrompt (AI-203)', () => {
  it('无目录时：含学习者画像全字段 + catalogNote，不含目录段', () => {
    const out = JSON.parse(buildPlanUserPrompt(sampleDto()));
    expect(out.learnerProfile.childId).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479');
    expect(out.learnerProfile.ageRange).toBe('6-8');
    expect(out.learnerProfile.level).toBe('a1');
    expect(out.learnerProfile.dailyMinutes).toBe(30);
    expect(out.learnerProfile.interests).toEqual(['动物', '太空']);
    expect(out.learnerProfile.weeks).toBe(2);
    expect(out.catalogNote).toBeDefined();
    expect(out.curriculumCatalog).toBeUndefined();
    expect(out.catalogRule).toBeUndefined();
  });

  it('有目录时：含 curriculumCatalog + 强制引用真实 id 的 catalogRule', () => {
    const out = JSON.parse(buildPlanUserPrompt(sampleDto(), sampleCatalog()));
    expect(out.curriculumCatalog.courses).toHaveLength(1);
    expect(out.curriculumCatalog.lessons).toHaveLength(1);
    expect(out.curriculumCatalog.lessons[0].lessonId).toBe('l-0001');
    expect(out.curriculumCatalog.lessons[0].courseId).toBe('c-0001');
    expect(out.catalogRule).toContain('lessonId');
    expect(out.catalogRule).toContain('courseId');
    expect(out.catalogRule).toContain('真实');
    expect(out.catalogRule).toContain('UUID');
    expect(out.catalogRule).toContain('严禁');
    expect(out.catalogNote).toBeUndefined();
  });
});
