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
});
