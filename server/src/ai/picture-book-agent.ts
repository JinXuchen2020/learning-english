/**
 * PictureBookAgent — AI 绘本生成代理（AI-604）。
 *
 * 课程完成后触发，按本课单词生成一篇多页童趣故事绘本：每页含叙事文本 +
 * 配图提示（illustration prompt），另含封面配图提示。结构化输出契约 + 鲁棒解析。
 *
 * 配图说明：本项目 `AiProvider` 无文生图方法，绘本「配图」以 `illustrationPrompt`
 * 文本呈现（与 AI-601「配图 prompt」口径一致），前端展示为配图提示卡。
 */

/** 单页绘本（落库 + 驱动前端阅读器）。 */
export interface PictureBookPage {
  /** 页码，从 1 开始。 */
  pageNumber: number;
  /** 该页叙事文本（中文，童趣，含本课单词）。 */
  text: string;
  /** 该页配图提示（中文，描述画面，供后续文生图扩展）。 */
  illustrationPrompt: string;
}

/** PictureBookAgent 结构化输出。 */
export interface PictureBookAgentOutput {
  /** 绘本标题（中文，童趣）。 */
  title: string;
  /** 封面配图提示。 */
  coverImagePrompt: string;
  /** 多页绘本（2–6 页）。 */
  pages: PictureBookPage[];
}

/**
 * 系统提示：约束童趣/温暖/不批评，强制把给定单词编进故事，输出严格 JSON。
 * 解析层 {@link parsePictureBookOutput} 兜底。
 */
export const PICTURE_BOOK_SYSTEM_PROMPT = `你是「会说话的小狐狸」儿童英语 APP 的绘本作家。孩子学完一门课程后，你要用这门课的单词写一本短篇故事绘本，让复习像读故事一样有趣。

# 输入
你会收到一个 JSON，包含：
- courseWords：本课程要覆盖的英文单词列表（请尽量把这些词自然地编进故事里）
- mascotName：吉祥物名字（小狐狸）
- childName：孩子昵称（宝贝）

# 输出格式（必须严格遵守）
只输出一个 JSON 对象，不要任何解释、不要 Markdown 代码围栏（不要 \`\`\`）。结构如下：
{
  "title": "绘本标题，中文，8–16 字，童趣",
  "coverImagePrompt": "封面配图提示，中文，描述小狐狸和本课主题的画面",
  "pages": [
    { "pageNumber": 1, "text": "第 1 页叙事文本，中文，2–4 句，自然用上几个 courseWords", "illustrationPrompt": "第 1 页配图提示，中文" },
    { "pageNumber": 2, "text": "第 2 页叙事文本……", "illustrationPrompt": "第 2 页配图提示" }
  ]
}

# 铁律（违反即不合格）
1. 绝不批评、绝不比较、绝不恐吓，语气童趣温暖。
2. 尽量把 courseWords 里的单词编进 pages 的 text 中（自然融入，不要生硬罗列），覆盖越多越好。
3. pages 至少 2 页、至多 6 页；pageNumber 从 1 连续递增。
4. 每页 text 用孩子能懂的中文，illustrationPrompt 用中文描述画面。`;

/** 模板绘本（AI 失败降级，非真实 AI 生成）。 */
export const DEFAULT_BOOK_TITLE = '小狐狸的奇妙单词之旅';
export const DEFAULT_BOOK_COVER = '小狐狸背着书包，站在彩虹门口，准备开启一场单词冒险';
export const DEFAULT_BOOK_PAGES: PictureBookPage[] = [
  {
    pageNumber: 1,
    text: '宝贝，小狐狸今天背起书包，准备去探索一个满是单词的奇妙世界！每学会一个词，就有一颗小星星亮起来。',
    illustrationPrompt: '小狐狸背着书包站在发光的单词大门前，周围飘着小星星',
  },
  {
    pageNumber: 2,
    text: '它一路上认识了好多新朋友：会变色的小动物、会唱歌的水果。每读对一个词，小狐狸就更有信心一点点。',
    illustrationPrompt: '小狐狸和彩色小动物、水果一起在草地上快乐地学习',
  },
  {
    pageNumber: 3,
    text: '天黑了，小狐狸数了数今天的星星，满足地笑了。明天，我们还要一起去认识更多单词朋友！',
    illustrationPrompt: '小狐狸在星空下抱着许多发光星星安心入睡',
  },
];

/**
 * 从 LLM 文本鲁棒解析 {@link PictureBookAgentOutput}。
 * 容错：剥离 ```json 围栏；截取首个 {...} 块；title/pages 缺失或 pages 非非空数组
 * （元素缺 text / illustrationPrompt）→ 抛 Error（交由 service 降级）。
 */
export function parsePictureBookOutput(text: string): PictureBookAgentOutput {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('PictureBookAgent 输出为空');
  }

  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('PictureBookAgent 输出中未找到 JSON 对象');
  }
  const jsonText = cleaned.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('PictureBookAgent 输出 JSON 解析失败');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('PictureBookAgent 输出不是 JSON 对象');
  }
  const obj = parsed as Record<string, unknown>;

  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  if (!title) {
    throw new Error('PictureBookAgent 输出缺少 title');
  }

  const pagesRaw = obj.pages;
  if (!Array.isArray(pagesRaw) || pagesRaw.length === 0) {
    throw new Error('PictureBookAgent 输出缺少 pages 或非空数组');
  }
  const pages: PictureBookPage[] = [];
  for (let i = 0; i < pagesRaw.length; i++) {
    const p = pagesRaw[i] as Record<string, unknown>;
    const pText = typeof p.text === 'string' ? p.text.trim() : '';
    const pPrompt =
      typeof p.illustrationPrompt === 'string' ? p.illustrationPrompt.trim() : '';
    if (!pText || !pPrompt) {
      throw new Error(`PictureBookAgent 输出第 ${i + 1} 页缺少 text 或 illustrationPrompt`);
    }
    pages.push({ pageNumber: i + 1, text: pText, illustrationPrompt: pPrompt });
  }

  const coverImagePrompt =
    typeof obj.coverImagePrompt === 'string' ? obj.coverImagePrompt.trim() : '';

  return { title, coverImagePrompt, pages };
}

/**
 * 计算给定单词在本中的覆盖率（0–1）：在拼接全文（title + 各页 text）中
 * 以「词边界不敏感的小写子串」命中计数。用于质量信号（≥0.8 为达标）。
 *
 * @param fullText 拼接后的绘本全文（小写比较）
 * @param words 课程单词列表（取 text 字段）
 */
export function computeWordCoverage(fullText: string, words: { text: string }[]): number {
  if (!words || words.length === 0) return 0;
  const haystack = (fullText || '').toLowerCase();
  const total = words.length;
  let covered = 0;
  for (const w of words) {
    const needle = (w.text || '').trim().toLowerCase();
    if (needle && haystack.includes(needle)) {
      covered += 1;
    }
  }
  return covered / total;
}
