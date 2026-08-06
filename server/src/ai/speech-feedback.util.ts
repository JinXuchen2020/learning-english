/**
 * speech-feedback.util — 口语评测反馈装配（AI-306，纯逻辑层）
 *
 * 零依赖、node 可测。把 AI-305 产出的统一 `ScoreResult` 转化为面向儿童的
 * `SpeechFeedback`（通过标记 + 等级档位 + 吉祥物表情），并组装落库入参
 * `AiSpeechAttemptEntry`（处理 userId/audioPath 占位边界）。
 *
 * 与 AI-302/304/305 同口径：纯函数抽到 util，服务层只做组合，便于 node 单测直覆。
 *
 * @module ai/speech-feedback.util
 */

import { MascotExpression, ScoreResult } from './ai-provider.interface';
import { AiSpeechAttemptEntry } from './ai-speech-attempt.entity';
import { EvaluateSpeechDto } from './speech-evaluate.dto';
import { inferMascotExpr } from './text-similarity.util';

/** 发音评分通过线（60 分）。低于此分不通过，驱动 AI-307 星级/鼓励动画。 */
export const PASS_LINE = 60;

/** 口语反馈等级档位。 */
export type SpeechLevel = 'good' | 'ok' | 'weak';

/**
 * 面向儿童的口语评测反馈：`ScoreResult` 增强结构。
 * 继承 `score / readableText / weakPhonemes / feedback / mascotExpr`，
 * 追加 `passed`（是否通过）+ `level`（等级档位）。
 */
export interface SpeechFeedback extends ScoreResult {
  /** 是否通过（score >= {@link PASS_LINE}）。 */
  passed: boolean;
  /** 等级档位：good(≥80) / ok(≥PASS_LINE) / weak(<PASS_LINE)。 */
  level: SpeechLevel;
}

/** 落库入参装配时的内联音频占位（评测接口收 multer 内联 buffer，无持久路径）。 */
export const INLINE_AUDIO_PLACEHOLDER = '<inline>';

/** 未提供 userId 时的匿名占位（与 `USER_ID_RESOLVER_TOKEN` 默认 `anonymous` 同口径）。 */
export const ANONYMOUS_USER_PLACEHOLDER = 'anonymous';

/**
 * 按分数判定等级档位（边界用 `>=`）。
 * - `good`: score ≥ 80
 * - `ok`:   score ≥ {@link PASS_LINE}(60)
 * - `weak`: score < PASS_LINE
 */
export function levelFromScore(score: number): SpeechLevel {
  if (score >= 80) return 'good';
  if (score >= PASS_LINE) return 'ok';
  return 'weak';
}

/**
 * 由统一 `ScoreResult` 装配面向儿童的反馈结构。
 * - `passed` = score ≥ 通过线
 * - `level` = 等级档位
 * - `mascotExpr`：优先取 `result.mascotExpr`，缺失时按分数推断（`inferMascotExpr`）
 */
export function buildSpeechFeedback(result: ScoreResult): SpeechFeedback {
  const mascotExpr: MascotExpression =
    (result.mascotExpr as MascotExpression) || inferMascotExpr(result.score);
  return {
    ...result,
    passed: result.score >= PASS_LINE,
    level: levelFromScore(result.score),
    mascotExpr,
  };
}

/**
 * 装配落库入参（{@link AiSpeechAttemptEntry}）。
 *
 * 边界占位（保持 AI-301 `ai_speech_attempts` 实体契约稳定，不改 entity）：
 * - `userId` 未提供/空白 → {@link ANONYMOUS_USER_PLACEHOLDER}（鉴权 deferred，userId 走 body）
 * - `audioPath` 未提供（内联上传场景）→ {@link INLINE_AUDIO_PLACEHOLDER}
 *   （音频持久化/对象存储属后续存储 feature，本 feature 仅记录评分）
 * - `wordId` / `sentenceId` 直接透传（二选一，另一个为 null）
 * - `score` / `weakPhonemes` 透传（落库层 AI-301 再做 `clampScore`/`sanitizePhonemes` 兜底）
 */
export function buildAttemptEntry(
  userId: string | undefined,
  dto: EvaluateSpeechDto,
  result: ScoreResult,
): AiSpeechAttemptEntry {
  return {
    userId:
      userId && userId.trim().length > 0 ? userId.trim() : ANONYMOUS_USER_PLACEHOLDER,
    wordId: dto.wordId ?? null,
    sentenceId: dto.sentenceId ?? null,
    audioPath:
      dto.audioPath && dto.audioPath.trim().length > 0
        ? dto.audioPath.trim()
        : INLINE_AUDIO_PLACEHOLDER,
    score: result.score,
    weakPhonemes: result.weakPhonemes,
  };
}
