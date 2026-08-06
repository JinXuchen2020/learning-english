/**
 * 内容安全配置（AI-406）：关键词黑名单 + 安全兜底回复。
 *
 * 黑名单是双保险的**第一道同步硬闸**，命中即拦（零网络开销、必然生效），
 * 兜住 NVIDIA 语义分类器接入前的空窗与语义漏网。
 *
 * 性质说明（启发式）：
 * - 中英文混合，覆盖：脏话/色情、暴力/自伤、违禁品、仇恨辱骂、提示词注入。
 * - 归一化后做子串匹配（见 `matchBlocklist`），故选用**无歧义词条**，
 *   避免误伤常见词（如不放 `ass`，否则 `class` 会被误拦）。
 * - 命中仅作软拦截（返回安全兜底回复），不记录、不惩罚用户。
 * - 列表按产品与安全策略持续扩展；语义更微妙的有害内容交给 NVIDIA 分类器（第二道闸）。
 *
 * @module chat/chat-safety.config
 */

/** 关键词黑名单（小写、无空格；归一化匹配）。 */
export const SAFETY_BLOCKLIST: readonly string[] = [
  // 脏话 / 色情
  'fuck', 'shit', 'bitch', 'damn', 'slut', 'whore', 'asshole', 'bastard',
  'sex', 'porn', 'naked', 'penis', 'vagina', 'dick',
  '操你', '妈的', '傻逼', '贱人', '淫', '色情',
  // 暴力 / 自伤
  'kill', 'murder', 'suicide', 'die', 'blood',
  '死', '杀', '暴力', '自杀', '血',
  'gun', 'bomb', 'weapon', 'knife',
  '枪', '炸弹', '武器', '刀',
  // 违禁品
  'drug', 'cocaine', 'crack',
  '毒品', '毒品', '可卡因', '抽烟', '喝酒',
  'alcohol', 'beer', 'wine', 'cigarette',
  '酒', '烟', '香烟',
  // 仇恨 / 辱骂
  'idiot', 'stupid',
  '笨蛋', '傻子', '废物', '去死',
  // 提示词注入（试图绕过狐狸人设 / 系统设定）
  'ignore previous instructions', 'ignore the instructions', '忽略前面的指令',
  '忽略系统', '忘记你的设定', '忘记你的身份', 'system prompt',
];

/** 归一化：小写 + 去空白 + 去非字母数字/非 CJK 标点，用于黑名单子串匹配。 */
export function normalizeForMatch(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * 关键词黑名单匹配。
 * @param text 待检文本
 * @returns 命中的关键词（原样，用于日志/原因）；未命中返回 null
 */
export function matchBlocklist(text: string): string | null {
  if (!text) return null;
  const norm = normalizeForMatch(text);
  for (const kw of SAFETY_BLOCKLIST) {
    const nk = normalizeForMatch(kw);
    if (nk && norm.includes(nk)) return kw;
  }
  return null;
}

/**
 * 命中内容安全时返回的狐狸吉祥物安全兜底回复（中英双语，温和带离）。
 * 不暴露「被拦截」，不带任何指责，把话题引回儿童友好的英语小游戏。
 */
export const SAFE_FALLBACK_REPLY =
  "Oops! Let's keep our chat happy and friendly. What would you like to talk about? " +
  "We can practice animals, colors, or say hello! " +
  '（哎呀，我们聊点开心的吧！你想聊什么呢？我们可以聊动物、颜色，或者打个招呼！）';
