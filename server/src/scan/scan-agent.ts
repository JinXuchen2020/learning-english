/**
 * scan-agent — 拍照识词输出解析（纯逻辑层）
 *
 * 把 `AiProvider.chatWithImage` 返回的自由文本解析为结构化单词卡数组。
 * LLM 可能返回：裸 JSON 数组 / ` ```json ``` ` 围栏包裹 / 单个对象 / 夹杂说明文字，
 * 本层统一剥离围栏、容错解析，并对每张卡做最小结构校验
 * （必须含英文 `word` + 中文 `meaning`），过滤无效项。
 *
 * 解析失败 / 无有效卡 → 返回空数组（由 service 翻译为「识别不出」友好兜底，不抛 500）。
 *
 * @module scan/scan-agent
 */

/** 解析出的单张生词卡（与 `ScannedWord` 入库字段对齐）。 */
export interface GeneratedScanCard {
  /** 英文单词。 */
  wordText: string;
  /** 中文释义。 */
  meaning: string;
  /** 英文例句（可空）。 */
  example: string | null;
  /** 配图 prompt（可空）。 */
  imagePrompt: string | null;
}

/**
 * 从自由文本中提取 JSON 片段：先尝试剥离 ` ```json ` / ` ``` ` 围栏，
 * 再在剩余文本里寻找首个 `[` 或 `{` 到配对的 `]` / `}` 子串。
 * 无任何 JSON 结构 → 返回 null。
 */
export function extractJson(text: string): string | null {
  if (!text) return null;
  let s = text.trim();
  // 剥离 ```json ... ``` 围栏
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    s = fence[1].trim();
  }
  // 寻找首对数组/对象括号
  const open = s.search(/[[{]/);
  if (open === -1) return null;
  const closeCh = s[open] === '[' ? ']' : '}';
  // 从末尾反向找配对的闭合括号
  const close = s.lastIndexOf(closeCh);
  if (close <= open) return null;
  return s.slice(open, close + 1);
}

/**
 * 解析拍照识词输出为单词卡数组。
 * @param text `chatWithImage` 返回的文本内容
 * @returns 通过最小校验的卡片数组（可能为空）
 */
export function parseScanOutput(text: string): GeneratedScanCard[] {
  const json = extractJson(text);
  if (!json) return [];

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }

  const arr = Array.isArray(data) ? data : [data];
  const cards: GeneratedScanCard[] = [];

  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const wordText = typeof o.word === 'string' ? o.word.trim() : '';
    const meaning =
      typeof o.meaning === 'string'
        ? o.meaning.trim()
        : typeof o.translation === 'string'
          ? o.translation.trim()
          : '';
    // 最小校验：英文单词 + 中文释义都不可为空
    if (!wordText || !meaning) continue;

    const example =
      typeof o.example === 'string' && o.example.trim() ? o.example.trim() : null;
    const imagePrompt =
      typeof o.imagePrompt === 'string' && o.imagePrompt.trim()
        ? o.imagePrompt.trim()
        : null;

    cards.push({ wordText, meaning, example, imagePrompt });
  }

  return cards;
}

/**
 * 组装 OCR 系统提示（中英双语，要求结构化 JSON 输出）。
 * 始终含「识别」「单词」关键词，确保 MockProvider 走 OCR 夹具分支。
 */
export function buildScanPrompt(userHint?: string): string {
  const hint = userHint && userHint.trim() ? `，重点关注：${userHint.trim()}` : '';
  return (
    `请识别图片中的物体或文字，生成适合儿童学习的英文单词卡片${hint}。` +
    `只输出 JSON 数组，每张卡含字段：word(英文单词)、meaning(中文释义)、` +
    `example(英文例句)、imagePrompt(配图英文描述)。不要输出额外说明文字。`
  );
}
