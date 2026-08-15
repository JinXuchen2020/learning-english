import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsNumber,
  Min,
} from 'class-validator';

/**
 * `POST /api/ai/speech/evaluate` 请求体（AI-303）。
 *
 * 以 `multipart/form-data` 提交：`audio` 文件经 multer 单独处理（见 `AiController`），
 * 以下文本字段位于 form body。三者至少其一提供参考文本（见 `AiSpeechEvaluatorService`
 * 的 `resolveReferenceText`）：`wordId` / `sentenceId` / `referenceText`。
 *
 * 全局 `ValidationPipe(whitelist+transform+forbidNonWhitelisted)` 生效：
 * 仅下列字段允许，`durationMs` 由字符串自动转 number。
 */
export class EvaluateSpeechDto {
  /** 单词 id → 解析 `Word.text` 作参考文本。 */
  @IsOptional()
  @IsString()
  wordId?: string;

  /** 句子 id（句库 AI-309 落地；service 层查 `Sentence.text` 作参考文本，未命中 → 404 `SENTENCE_NOT_FOUND`）。 */
  @IsOptional()
  @IsString()
  sentenceId?: string;

  /** 直传参考文本（句子模式 / E2E 便利）。 */
  @IsOptional()
  @IsString()
  referenceText?: string;

  /** 客户端上报录音时长（毫秒），来自 `SpeechRecorder.durationMs`。 */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  durationMs?: number;

  /**
   * 归属用户 id（AI-306 落库 `ai_speech_attempts` 用）。
   * 鉴权 deferred（与本项目 M2 链口径一致，childId 走 body），未提供 → `anonymous` 占位。
   */
  @IsOptional()
  @IsString()
  userId?: string;

  /**
   * 音频持久路径（AI-306 落库用）。
   * 评测接口收 multer 内联 buffer 时无持久路径；若前端已落盘对象存储则传此值，
   * 未提供 → `<inline>` 占位（音频持久化属后续存储 feature）。
   */
  @IsOptional()
  @IsString()
  audioPath?: string;

  /**
   * 客户端（浏览器 Web Speech API）预转写文本。
   * 提供时后端跳过 provider STT 链，直接用此文本做发音评分。
   * 解决云端 STT（Agnes whisper / Google）不可达时音频静默失败的问题。
   */
  @IsOptional()
  @IsString()
  clientTranscript?: string;
}
