import {
  buildChatSystemPrompt,
  FOX_PERSONA,
  SCENE_PROMPTS,
  BASE_SAFETY_RULE,
} from './chat-system-prompt';

/**
 * 系统提示纯函数单测（AI-403）：验证人设/场景 framing/安全规则的组装逻辑，
 * 与具体 provider / DB 无关，node 环境直接跑。
 */
describe('buildChatSystemPrompt (AI-403)', () => {
  it('已知场景包含人设 + 对应 framing + 安全规则，且不含其它场景', () => {
    const p = buildChatSystemPrompt('zoo');
    expect(p).toContain(FOX_PERSONA);
    expect(p).toContain(SCENE_PROMPTS.zoo);
    expect(p).toContain(BASE_SAFETY_RULE);
    expect(p).not.toContain(SCENE_PROMPTS.greeting);
    expect(p).not.toContain(SCENE_PROMPTS.shopping);
  });

  it('未知 / 自由场景仅人设 + 安全规则（不含任何已知场景 framing）', () => {
    const p = buildChatSystemPrompt('some-future-scene');
    expect(p).toContain(FOX_PERSONA);
    expect(p).toContain(BASE_SAFETY_RULE);
    for (const key of Object.keys(SCENE_PROMPTS)) {
      expect(p).not.toContain(SCENE_PROMPTS[key]);
    }
  });

  it('null / undefined 场景等价于未知（仅人设 + 安全）', () => {
    const nullPrompt = buildChatSystemPrompt(null);
    const undefinedPrompt = buildChatSystemPrompt(undefined);
    expect(nullPrompt).toBe(undefinedPrompt);
    expect(undefinedPrompt).toContain(FOX_PERSONA);
    expect(undefinedPrompt).toContain(BASE_SAFETY_RULE);
  });

  it('安全规则恒在（儿童守护基线，覆盖全部场景）', () => {
    for (const scene of ['greeting', 'zoo', 'shopping', 'weather', 'body', null]) {
      const p = buildChatSystemPrompt(scene as string | null);
      expect(p).toContain('不收集'); // 基线安全规则中隐私守护断言
    }
  });

  it('全部已知场景均能产出含 framing 的提示', () => {
    const keys = Object.keys(SCENE_PROMPTS);
    expect(keys).toEqual(['greeting', 'zoo', 'shopping', 'weather', 'body']);
    for (const k of keys) {
      expect(buildChatSystemPrompt(k)).toContain(SCENE_PROMPTS[k]);
    }
  });

  describe('狐狸人设适配维度 (AI-404)', () => {
    it('明确面向 5 到 10 岁中国小朋友', () => {
      expect(FOX_PERSONA).toContain('5 到 10 岁');
    });

    it('约束使用 A1 级简单词汇', () => {
      expect(FOX_PERSONA).toContain('A1 级简单词汇');
    });

    it('小朋友说错时换说法示范（不批评、不纠正语法）', () => {
      expect(FOX_PERSONA).toContain('换一种');
      expect(FOX_PERSONA).toContain('绝不批评');
    });

    it('允许中英混说确认并英文复述', () => {
      expect(FOX_PERSONA).toContain('用一点点中文');
      expect(FOX_PERSONA).toContain('复述');
    });

    it('话题守界：不合适话题温柔带回到英语小游戏', () => {
      expect(FOX_PERSONA).toContain('带回到');
      expect(FOX_PERSONA).toContain('话题守界');
    });

    it('人设作为 system 角色进入 LLM 上下文（自由场景）', () => {
      const p = buildChatSystemPrompt(null);
      expect(p.indexOf(FOX_PERSONA)).toBeGreaterThanOrEqual(0);
    });
  });
});
