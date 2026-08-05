import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EvaluateSpeechDto } from './speech-evaluate.dto';
import {
  AiSpeechEvaluatorService,
  UploadedAudioFile,
} from './ai-speech-evaluator.service';
import {
  SpeechEvaluateError,
  HARD_UPLOAD_LIMIT_BYTES,
} from './speech-evaluate.validation';
import { logger } from '../common/logger/logger';

/**
 * AI 口语评测控制器（AI-303）。
 *
 * 路由（全局前缀 `api`）：`POST /api/ai/speech/evaluate`
 *  - `audio` 文件经 multer `FileInterceptor('audio')` 接收（硬上限 10MB 防内存爆，
 *    精确 5MB 判定在 service 层 → 413）。
 *  - 评分逻辑委托 `AiSpeechEvaluatorService`；其抛出的 `SpeechEvaluateError`
 *    在此翻译为对应 HTTP 状态码 + 机器可读 `code`。
 *
 * 按本项目 AI 接口约定（同 `PlanController`），本组接口**不加** `JwtAuthGuard`
 * （鉴权按计划文档留待后续），`userId` 解析由 AI-108 审计层统一处理。
 */
@Controller('ai/speech')
export class AiController {
  constructor(private readonly evaluator: AiSpeechEvaluatorService) {}

  @Post('evaluate')
  @UseInterceptors(
    FileInterceptor('audio', { limits: { fileSize: HARD_UPLOAD_LIMIT_BYTES } }),
  )
  async evaluate(
    @UploadedFile() file: UploadedAudioFile,
    @Body() dto: EvaluateSpeechDto,
  ) {
    try {
      return await this.evaluator.evaluate({ file, dto });
    } catch (err) {
      if (err instanceof SpeechEvaluateError) {
        throw new HttpException(
          { code: err.code, message: err.message },
          err.status as HttpStatus,
        );
      }
      logger.error('[AI] 口语评测失败', err as Error);
      throw err;
    }
  }
}
