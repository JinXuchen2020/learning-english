/**
 * MascotStoryAgent — 吉祥物成长剧情生成代理（AI-603）。
 *
 * 学习里程碑（等级提升）触发，生成温暖、鼓励、适合 6–10 岁儿童的成长剧情文案。
 * 结构化输出契约 + 鲁棒解析（兼容模型夹带说明文字 / Markdown 围栏）。
 */

/** MascotStoryAgent 结构化输出（落库 + 驱动前端剧情卡）。 */
export interface MascotStoryAgentOutput {
  /** 剧情标题（中文，童趣）。 */
  title: string;
  /** 剧情正文（中文，温暖鼓励）。 */
  storyText: string;
}

/**
 * 系统提示：约束童趣/温暖/不批评，输出严格 JSON（title + storyText）。
 * 解析层 {@link parseMascotStoryOutput} 兜底。
 */
export const MASCOT_STORY_SYSTEM_PROMPT = `你是「会说话的小狐狸」儿童英语 APP 的剧情作家。当孩子学习达到新等级（收集到更多星星）时，你要为小狐狸写一段温暖的「成长剧情」，表扬孩子的努力、描述小狐狸因此获得的新装饰或新本领。

# 输出格式（必须严格遵守）
只输出一个 JSON 对象，不要任何解释、不要 Markdown 代码围栏（不要 \`\`\`）。结构如下：
{
  "title": "剧情标题，中文，8–16 字，童趣",
  "storyText": "剧情正文，中文，3–5 句，温暖鼓励，像在给小朋友讲故事"
}

# 铁律（违反即不合格）
1. 绝不批评、绝不比较、绝不恐吓。把"努力"说成值得骄傲的事。
2. 语气童趣、温暖，像伙伴一样陪孩子成长。
3. title 简短有画面感；storyText 用孩子能懂的话，3–5 句。
4. 可以提及小狐狸因为孩子的坚持而长出新帽子 / 围巾 / 披风 / 光环 / 王冠等装饰（与等级对应），但不要写任何英文教学压力。

# 输入字段说明
- level：孩子达到的新等级（1–6）
- totalStars：孩子累计收集的星星总数
- mascotName：吉祥物名字（小狐狸）
- childName：孩子昵称（宝贝）`;

/** 模板剧情（AI 失败降级，非真实 AI 生成）。 */
export const DEFAULT_STORY_TITLE = '小狐狸的小小勋章';
export const DEFAULT_STORY_TEXT =
  '宝贝，你每一次打开 APP 学英语，小狐狸都悄悄记在心里。今天它戴上了一枚亮亮的小勋章，因为你的坚持让它变得更神气啦！继续和我们一起冒险吧～';

/**
 * 从 LLM 文本鲁棒解析 {@link MascotStoryAgentOutput}。
 * 容错：剥离 ```json 围栏；截取首个 {...} 块；title/storyText 缺失/空 → 抛 Error（交由 service 降级）。
 */
export function parseMascotStoryOutput(text: string): MascotStoryAgentOutput {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('MascotStoryAgent 输出为空');
  }

  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('MascotStoryAgent 输出中未找到 JSON 对象');
  }
  const jsonText = cleaned.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('MascotStoryAgent 输出 JSON 解析失败');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('MascotStoryAgent 输出不是 JSON 对象');
  }
  const obj = parsed as Record<string, unknown>;
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  const storyText = typeof obj.storyText === 'string' ? obj.storyText.trim() : '';
  if (!title || !storyText) {
    throw new Error('MascotStoryAgent 输出缺少 title 或 storyText');
  }
  return { title, storyText };
}
