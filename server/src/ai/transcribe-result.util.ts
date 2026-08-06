/**
 * 转写结果处理纯逻辑（AI-304 STT 集成）
 *
 * 把底层 `provider.transcribe` 产出的 {@link TranscriptResult} 归一化、判定降级，
 * 供下游（AI-305 评分兜底 / AI-306 低分）消费。**纯函数、零依赖**，可在 node 环境
 * 直覆单测（对齐 AI-302 `lib/speech-recorder.ts`、AI-303 `speech-evaluate.validation.ts` 模式）。
 *
 * @module ai/transcribe-result.util
 */

import { TranscriptResult } from './ai-provider.interface';

/** 降级置信度阈值：低于此值的转写视为低质量（静音/噪声）。 */
export const DEGRADED_CONFIDENCE_THRESHOLD = 0.3;

/** 转写降级原因。 */
export type TranscriptDegradeReason = 'empty' | 'low_confidence' | 'provider_error';

/** 转写分类判定。 */
export interface TranscriptVerdict {
  /** 是否降级（空转写 / 低置信度 / provider 错误）。 */
  degraded: boolean;
  /** 降级原因（仅在 degraded=true 时出现）。 */
  reason?: TranscriptDegradeReason;
}

/** 转写摘要（归一化 + 降级标注 + 词数）。 */
export interface TranscriptSummary {
  /** 原始文本。 */
  rawText: string;
  /** 归一化文本（小写 / 去标点 / 折叠空格）。 */
  normalizedText: string;
  /** 归一化后词数（0 表示空）。 */
  wordCount: number;
  /** 整体置信度 [0,1]，可选。 */
  confidence?: number;
  /** 是否降级。 */
  degraded: boolean;
  /** 降级原因（仅降级时出现）。 */
  degradeReason?: TranscriptDegradeReason;
}

/**
 * 归一化转写文本：转小写、剥离非字母数字空白字符、折叠连续空白、去首尾空白。
 * 用于下游相似度比对（AI-305）与展示归一化。
 * @param text 原始转写文本
 * @returns 归一化文本（输入为空/undefined 时返回空串）
 */
export function normalizeTranscript(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 分类转写结果是否降级（供评分层判断是否走兜底策略）。
 * @param input 待判定的转写片段
 * @returns 判定结果 {@link TranscriptVerdict}
 */
export function classifyTranscript(input: { text?: string; confidence?: number }): TranscriptVerdict {
  const text = input.text ?? '';
  if (text.trim().length === 0) {
    return { degraded: true, reason: 'empty' };
  }
  if (input.confidence != null && input.confidence < DEGRADED_CONFIDENCE_THRESHOLD) {
    return { degraded: true, reason: 'low_confidence' };
  }
  return { degraded: false };
}

/**
 * 汇总转写结果：归一化文本 + 降级判定 + 词数统计。
 * @param result 底层转写结果
 * @returns 摘要 {@link TranscriptSummary}
 */
export function summarizeTranscript(result: TranscriptResult): TranscriptSummary {
  const rawText = result.text ?? '';
  const normalizedText = normalizeTranscript(rawText);
  const verdict = classifyTranscript({ text: rawText, confidence: result.confidence });
  return {
    rawText,
    normalizedText,
    wordCount: normalizedText.length === 0 ? 0 : normalizedText.split(' ').length,
    confidence: result.confidence,
    degraded: verdict.degraded,
    degradeReason: verdict.reason,
  };
}
