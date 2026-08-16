/**
 * 发音评分纯逻辑（AI-305 发音评分策略）
 *
 * 把「转写文本相似度（编辑距离）+ LLM 评估」兜底评分所需的纯计算抽离，
 * 供 `AiPronunciationScorerService` 编排调用。**纯函数、零依赖**（仅导入类型 +
 * AI-304 的 `normalizeTranscript`），可在 node 环境直覆单测
 * （对齐 AI-302 `lib/speech-recorder.ts`、AI-303 `speech-evaluate.validation.ts`、
 * AI-304 `transcribe-result.util.ts` 模式）。
 *
 * @module ai/text-similarity.util
 */

import { MascotExpression } from './ai-provider.interface';
import { normalizeTranscript } from './transcribe-result.util';

/** 评分策略：音素级（首选）/ 转写相似度兜底。 */
export type ScoringStrategy = 'phoneme' | 'similarity';

/** 策略选择入参。 */
export interface StrategySelection {
  /** 显式强制策略（非空则覆盖自动推断）。 */
  strategy?: 'auto' | ScoringStrategy;
  /** 当前 provider 名称（auto 模式下决定首选路径）。AI-713：放宽到 string，
   * 因为运行时真实 provider 名（如「智谱 GLM (系统默认)」）超出原 ProviderName 联合类型。 */
  providerName?: string;
}

/**
 * Levenshtein 编辑距离（滚动数组，空间 O(min(m,n))）。
 * @param a 参考文本（建议先归一化）
 * @param b 待比对文本（建议先归一化）
 * @returns 最小单字符编辑（插入/删除/替换）次数
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

/**
 * 相似度比率 [0,1]：基于归一化后的编辑距离。
 * 1 = 完全一致；0 = 完全无关（或一侧为空）。
 * @param reference 参考文本（目标读音）
 * @param transcript 用户转写文本
 */
export function similarityRatio(reference: string, transcript: string): number {
  const a = normalizeTranscript(reference);
  const b = normalizeTranscript(transcript);
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * 由相似度比率映射到 [0,100] 分数（round + 含 0/100 边界 clamp）。
 * @param ratio 相似度比率 [0,1]
 */
export function scoreFromSimilarity(ratio: number): number {
  const clamped = Math.max(0, Math.min(1, ratio));
  return Math.round(clamped * 100);
}

/**
 * 自动选择评分策略：
 * - 显式 `strategy` 覆盖自动推断。
 * - 否则 `providerName==='azure'`（具备 phoneme 级评测能力）→ 首选 `'phoneme'`；
 *   其余（bigmodel / nvidia / mock）无 phoneme 级能力 → `'similarity'`。
 */
export function selectScoringStrategy(sel: StrategySelection): ScoringStrategy {
  if (sel.strategy === 'phoneme' || sel.strategy === 'similarity') {
    return sel.strategy;
  }
  return sel.providerName === 'azure' ? 'phoneme' : 'similarity';
}

/**
 * 由分数推导吉祥物表情（LLM 评估缺失时的兜底）。
 * @param score 发音得分 [0,100]
 */
export function inferMascotExpr(score: number): MascotExpression {
  if (score >= 85) return 'happy';
  if (score >= 60) return 'encourage';
  return 'thinking';
}

/** LLM 评估解析结果。 */
export interface LlmAssessment {
  /** 鼓励性反馈文案（解析失败时为全文）。 */
  feedback?: string;
  /** 薄弱音素列表（已过滤非字符串项）。 */
  weakPhonemes: string[];
  /** 吉祥物表情（仅当 LLM 返回合法枚举值时出现）。 */
  mascotExpr?: MascotExpression;
}

/**
 * 解析 LLM 评估文本。优先抽取 `{feedback, weakPhonemes, mascotExpr}` JSON（容错：
 * 非 JSON / 解析失败 → 全文作 feedback，弱音素为空，mascotExpr 忽略）。
 *
 * 额外处理 LLM 常见错误：feedback 文案里出现未转义的英文双引号（如 "think"）导致
 * 整个 JSON 不合法。此时按已知字段边界手动提取，避免把整段 JSON 直接展示给孩子。
 * @param text LLM 返回文本
 */
export function parseLlmAssessment(text: string): LlmAssessment {
  const trimmed = (text || '').trim();
  if (trimmed.length === 0) return { weakPhonemes: [] };

  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    const rawJson = trimmed.slice(jsonStart, jsonEnd + 1);
    try {
      return normalizeLlmAssessment(JSON.parse(rawJson));
    } catch {
      // JSON 不合法（常见原因是 feedback 字段内有未转义双引号），尝试容错提取。
      const fallback = extractLlmAssessmentFields(rawJson);
      if (fallback.feedback !== undefined || fallback.weakPhonemes.length > 0 || fallback.mascotExpr) {
        return fallback;
      }
    }
  }
  return { feedback: trimmed, weakPhonemes: [] };
}

function normalizeLlmAssessment(obj: unknown): LlmAssessment {
  const payload = obj as Record<string, unknown>;
  const weakPhonemes = Array.isArray(payload.weakPhonemes)
    ? payload.weakPhonemes.filter((x: unknown): x is string => typeof x === 'string')
    : [];
  const mascotExpr = (['happy', 'encourage', 'thinking', 'cheer'] as const).includes(
    payload.mascotExpr as MascotExpression,
  )
    ? (payload.mascotExpr as MascotExpression)
    : undefined;
  return {
    feedback: typeof payload.feedback === 'string' ? payload.feedback : undefined,
    weakPhonemes,
    mascotExpr,
  };
}

/**
 * 当 JSON.parse 失败时的兜底字段提取。
 * 按 `"fieldName"` 定位，用下一个已知字段前面的引号作为字符串边界，
 * 从而容忍 feedback 文案里出现未转义的英文双引号。
 */
function extractLlmAssessmentFields(text: string): LlmAssessment {
  const result: LlmAssessment = { weakPhonemes: [] };

  const feedback = extractQuotedFieldValue(text, 'feedback', ['weakPhonemes', 'mascotExpr']);
  if (feedback !== undefined) result.feedback = feedback;

  const weakPhonemes = extractArrayFieldValue(text, 'weakPhonemes', ['mascotExpr']);
  if (weakPhonemes.length > 0) result.weakPhonemes = weakPhonemes;

  const rawMascotExpr = extractLiteralFieldValue(text, 'mascotExpr');
  const mascotExpr = rawMascotExpr
    ? (['happy', 'encourage', 'thinking', 'cheer'] as const).find((v) => v === rawMascotExpr)
    : undefined;
  if (mascotExpr) result.mascotExpr = mascotExpr;

  return result;
}

function extractQuotedFieldValue(
  text: string,
  fieldName: string,
  nextKeys: string[],
): string | undefined {
  const keyIdx = text.indexOf(`"${fieldName}"`);
  if (keyIdx < 0) return undefined;

  let i = keyIdx + `"${fieldName}"`.length;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== ':') return undefined;
  i++;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== '"') return undefined;
  i++; // 跳过开头引号

  // value 结束于下一个已知字段之前最近的 "
  let endQuote = -1;
  for (const nextKey of nextKeys) {
    const nextIdx = text.indexOf(`"${nextKey}"`, i);
    if (nextIdx > i) {
      let q = nextIdx - 1;
      while (q >= i && text[q] !== '"') q--;
      if (q >= i && (endQuote < 0 || q < endQuote)) endQuote = q;
    }
  }

  if (endQuote < 0) return undefined;
  return text.slice(i, endQuote);
}

function extractArrayFieldValue(text: string, fieldName: string, nextKeys: string[]): string[] {
  const keyIdx = text.indexOf(`"${fieldName}"`);
  if (keyIdx < 0) return [];

  let i = keyIdx + `"${fieldName}"`.length;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== ':') return [];
  i++;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== '[') return [];
  i++;

  const endIdx = text.indexOf(']', i);
  if (endIdx < 0) return [];

  // 确保 ']' 后面跟着逗号或 }，避免把 feedback 里出现的 ']' 误当数组结束
  const afterClose = text.slice(endIdx + 1).trimStart();
  if (!afterClose.startsWith(',') && !afterClose.startsWith('}')) {
    return [];
  }

  const inner = text.slice(i, endIdx);
  return inner
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter((s) => s.length > 0);
}

function extractLiteralFieldValue(text: string, fieldName: string): string | undefined {
  const keyIdx = text.indexOf(`"${fieldName}"`);
  if (keyIdx < 0) return undefined;

  let i = keyIdx + `"${fieldName}"`.length;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== ':') return undefined;
  i++;
  while (i < text.length && /\s/.test(text[i])) i++;

  const quoted = text.slice(i).match(/^"([^"]*)"/);
  if (quoted) return quoted[1];
  const bare = text.slice(i).match(/^([a-zA-Z0-9_]+)/);
  return bare ? bare[1] : undefined;
}

/**
 * 无 LLM 时的相似度兜底反馈文案（三档鼓励，中文，面向儿童）。
 * @param score 相似度分数 [0,100]
 * @param referenceText 参考文本（目标读音）
 * @param transcript 用户转写（可能为空，表示没听清）
 */
export function buildSimilarityFallbackFeedback(
  score: number,
  referenceText: string,
  transcript: string,
): string {
  if (score >= 85) return `太棒了！和「${referenceText}」几乎一模一样～`;
  if (score >= 60) return `不错哦！你说的和「${referenceText}」很接近，再练练更顺～`;
  return `再试试看～目标是读对「${referenceText}」（你读成了「${transcript || '没听清'}」）`;
}
