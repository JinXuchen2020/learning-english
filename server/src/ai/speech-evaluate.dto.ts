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

  /** 句子 id（句库 AI-309 落地；当前无 Sentence 实体，service 层返回 400）。 */
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
}
