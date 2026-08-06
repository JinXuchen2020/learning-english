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

import { MascotExpression, ProviderName } from './ai-provider.interface';
import { normalizeTranscript } from './transcribe-result.util';

/** 评分策略：音素级（首选）/ 转写相似度兜底。 */
export type ScoringStrategy = 'phoneme' | 'similarity';

/** 策略选择入参。 */
export interface StrategySelection {
  /** 显式强制策略（非空则覆盖自动推断）。 */
  strategy?: 'auto' | ScoringStrategy;
  /** 当前 provider 名称（auto 模式下决定首选路径）。 */
  providerName?: ProviderName;
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
 * @param text LLM 返回文本
 */
export function parseLlmAssessment(text: string): LlmAssessment {
  const trimmed = (text || '').trim();
  if (trimmed.length === 0) return { weakPhonemes: [] };

  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      const obj = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
      const weakPhonemes = Array.isArray(obj.weakPhonemes)
        ? obj.weakPhonemes.filter((x: unknown) => typeof x === 'string')
        : [];
      const mascotExpr = (['happy', 'encourage', 'thinking', 'cheer'] as const).includes(obj.mascotExpr)
        ? obj.mascotExpr
        : undefined;
      return {
        feedback: typeof obj.feedback === 'string' ? obj.feedback : undefined,
        weakPhonemes,
        mascotExpr,
      };
    } catch {
      // 解析失败，回退全文
    }
  }
  return { feedback: trimmed, weakPhonemes: [] };
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
