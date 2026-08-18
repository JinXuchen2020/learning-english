/**
 * AiPronunciationScorerService — 发音评分策略编排（AI-305）
 *
 * 对一次口语录音产出**统一 `ScoreResult`**（score ∈ [0,100]），并标注实际策略：
 * 本项目无 phoneme 级评测 provider（OpenAI 兼容端点不提供），统一走
 * 「转写(SttProvider) → 编辑距离相似度 → LLM 评估(ChatProvider) → 综合」兜底。
 *
 * 纯后端服务（无端点/无 UI），E2E 与 AI-301/303/304 同口径豁免。降级不抛错，
 * 与 AI-102/304 既定口径一致。
 *
 * @module ai/ai-pronunciation-scorer.service
 */

import { Injectable } from '@nestjs/common';
import {
  AssessOptions,
  AudioInput,
  ScoreResult,
} from './ai-provider.interface';
import { ChatProvider } from './chat.provider';
import { AiTranscribeService, TranscriptOutcome } from './ai-transcribe.service';
import {
  buildSimilarityFallbackFeedback,
  inferMascotExpr,
  parseLlmAssessment,
  scoreFromSimilarity,
  ScoringStrategy,
  similarityRatio,
} from './text-similarity.util';
import { logger } from '../common/logger/logger';

/** 评分入参。 */
export interface ScorePronunciationInput {
  /** 用户朗读音频。 */
  audio: AudioInput;
  /** 目标参考文本（单词或句子）。 */
  referenceText: string;
  /** 评测可选参数（含策略强制开关）。 */
  opts?: AssessOptions & { strategy?: 'auto' | ScoringStrategy };
  /**
   * 客户端（浏览器 Web Speech API）预转写文本。
   * 提供时跳过 provider STT 链，直接用此文本做相似度评分。
   * 解决云端 STT 不可达时音频静默失败的问题。
   */
  clientTranscript?: string;
}

/** 评分产出：标准 {@link ScoreResult} + 策略标记（类型在 service 内定义，不污染 AI-101 接口）。 */
export interface ScoredResult extends ScoreResult {
  /** 实际采用的评分策略。 */
  strategy: ScoringStrategy;
  /** 是否走了降级兜底（无 Azure / phoneme 失败 / 低分）。 */
  degraded?: boolean;
}

/** LLM 兜底评估的系统提示（儿童英语老师口吻）。 */
const SIMILARITY_ASSESS_SYSTEM =
  '你是儿童英语老师。对比参考文本与用户转写，用中文给出鼓励性反馈，并尽量用方括号标注薄弱音素（如 [θ]）。' +
  '可选返回 JSON: {"feedback":"...","weakPhonemes":["θ"],"mascotExpr":"encourage"}。';

/**
 * 发音评分策略编排服务。统一走「转写相似度 + LLM 评估」兜底，
 * 两种策略输出结构一致（本项目无 phoneme 级 provider）。
 */
@Injectable()
export class AiPronunciationScorerService {
  constructor(
    private readonly chatProvider: ChatProvider,
    private readonly transcriber: AiTranscribeService,
  ) {}

  /**
   * 评测一次口语录音，返回统一评分结果。
   * @param input 音频 + 参考文本 + 可选策略
   * @returns 评分结果 {@link ScoredResult}
   */
  async score(input: ScorePronunciationInput): Promise<ScoredResult> {
    // 本项目无 phoneme 级评测 provider，统一走相似度兜底评分。
    return this.scoreBySimilarity(input);
  }

  /**
   * 兜底：transcribe → 编辑距离相似度 → LLM 评估 → 综合 ScoreResult。
   * 若 input.clientTranscript 已提供（浏览器 Web Speech API 预转写），
   * 则跳过 provider STT 链，直接用客户端文本做评分。
   * transcribe / chat 任一失败均降级（不抛错）。
   */
  private async scoreBySimilarity(input: ScorePronunciationInput): Promise<ScoredResult> {
    let transcript: TranscriptOutcome;

    if (input.clientTranscript && input.clientTranscript.trim().length > 0) {
      // 客户端已通过 Web Speech API 完成转写，跳过后端 STT 链
      transcript = {
        text: input.clientTranscript.trim(),
        confidence: 1, // 浏览器本地识别，视为高置信
        durationMs: undefined,
        degraded: false,
      };
      logger.debug(`[AiPronunciationScorer] 使用客户端预转写: "${input.clientTranscript.trim()}"`);
    } else {
      transcript = await this.transcriber.transcribe(input.audio, {
        language: input.opts?.language,
      });
    }
    const ratio = similarityRatio(input.referenceText, transcript.text);
    const score = scoreFromSimilarity(ratio);

    let feedback = '';
    let weakPhonemes: string[] = [];
    let mascotExpr = inferMascotExpr(score);

    try {
      const chat = await this.chatProvider.chat(
        [
          { role: 'system', content: SIMILARITY_ASSESS_SYSTEM },
          {
            role: 'user',
            content:
              `参考文本: ${input.referenceText}\n` +
              `用户转写: ${transcript.text || '(无转写)'}\n` +
              `相似度: ${Math.round(ratio * 100)}%\n` +
              `请用中文给儿童鼓励性反馈，并标注薄弱音素。`,
          },
        ],
        { temperature: 0.3 },
      );
      const parsed = parseLlmAssessment(chat.text);
      feedback = parsed.feedback || chat.text;
      weakPhonemes = parsed.weakPhonemes;
      if (parsed.mascotExpr) mascotExpr = parsed.mascotExpr;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn(`[AiPronunciationScorer] LLM 兜底评估失败，用相似度反馈: ${reason}`);
      feedback = buildSimilarityFallbackFeedback(score, input.referenceText, transcript.text);
    }

    const degraded = transcript.degraded || score < (input.opts?.passLine ?? 60);

    return {
      score,
      readableText: input.referenceText,
      weakPhonemes,
      feedback: feedback || buildSimilarityFallbackFeedback(score, input.referenceText, transcript.text),
      mascotExpr,
      strategy: 'similarity',
      degraded,
    };
  }
}
