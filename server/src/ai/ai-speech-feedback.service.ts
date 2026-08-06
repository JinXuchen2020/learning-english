/**
 * AiSpeechFeedbackService — 口语评分反馈 + 持久化（AI-306）
 *
 * 消费：
 * - AI-305 `AiPronunciationScorerService` 的统一 `ScoreResult`（经 AI-303 评测接口传入）
 * - AI-301 `AiSpeechAttemptService.record`（best-effort 落库到 `ai_speech_attempts`）
 *
 * 职责：
 * 1. 反馈装配：`buildSpeechFeedback`（纯逻辑，见 `speech-feedback.util.ts`）
 *    —— 通过标记 `passed`、等级 `level`、吉祥物表情 `mascotExpr`。
 * 2. 持久化：best-effort 落库评分与弱音素，**绝不阻断反馈返回**（与 AI-301/108 口径一致）。
 *
 * 纯后端服务（无端点/无 UI），E2E 与 AI-301/303/304/305 同口径豁免；
 * 用户级口语旅程（听→录→评→反馈→得星）随 AI-307 `/speech` 交付。
 *
 * @module ai/ai-speech-feedback.service
 */

import { Injectable } from '@nestjs/common';
import { AiSpeechAttemptService } from './ai-speech-attempt.service';
import { ScoreResult } from './ai-provider.interface';
import { EvaluateSpeechDto } from './speech-evaluate.dto';
import {
  buildAttemptEntry,
  buildSpeechFeedback,
  SpeechFeedback,
} from './speech-feedback.util';
import { logger } from '../common/logger/logger';

/** 反馈装配入参。 */
export interface FeedbackInput {
  /** 归属用户（来自 DTO；未提供 → anonymous 占位，见 util 边界约定）。 */
  userId?: string;
  /** 评测请求体（含 wordId/sentenceId/audioPath 占位来源）。 */
  dto: EvaluateSpeechDto;
  /** 统一评分结果（来自 AI-305 scorer）。 */
  result: ScoreResult;
}

/**
 * 口语评分反馈 + 持久化服务。
 *
 * 落库采用 best-effort：`AiSpeechAttemptService.record` 自身已吞异常返回 false，
 * 此处再兜一层 try/catch，确保即便落库链路抛错也**不阻断**反馈结构返回——孩子的
 * 口语反馈永远可用（与 AI-301/108 降级口径一致）。
 */
@Injectable()
export class AiSpeechFeedbackService {
  constructor(private readonly attempts: AiSpeechAttemptService) {}

  /**
   * 装配反馈并 best-effort 落库。
   * @returns 面向儿童的 {@link SpeechFeedback}（含 passed/level/mascotExpr）
   */
  async feedback(input: FeedbackInput): Promise<SpeechFeedback> {
    const entry = buildAttemptEntry(input.userId, input.dto, input.result);
    try {
      await this.attempts.record(entry);
    } catch (err) {
      // record 内部已 best-effort 吞异常；此处为二次兜底，确保绝不阻断反馈返回。
      logger.warn('[AI-SPEECH] 评分落库异常（二次兜底，不影响反馈返回）', {
        userId: entry.userId,
        error: (err as Error)?.message,
      });
    }
    return buildSpeechFeedback(input.result);
  }
}
