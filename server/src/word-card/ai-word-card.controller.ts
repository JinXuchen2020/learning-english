import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { AiWordCardService } from './ai-word-card.service';
import { GenerateWordCardDto } from './dto/generate-word-card.dto';
import { ReviewWordCardDto } from './dto/review-word-card.dto';
import { AiWordCard, WordCardStatus } from './ai-word-card.entity';

/** 允许过滤的 status 取值。 */
const ALLOWED_STATUSES: WordCardStatus[] = ['pending', 'approved', 'rejected'];

/**
 * AI 单词卡片生成控制器（AI-601）。
 * 路由前缀 `ai/word-card`（全局前缀 `/api` → `/api/ai/word-card`）。
 *
 * 鉴权口径：与 `/api/ai/report/*` 一致，本组路由暂不加 `JwtAuthGuard`
 * （生成/审核动作属家长域，待 AI-702 家长 PIN 收紧）；userId 非必需。
 *
 * @module word-card/ai-word-card.controller
 */
@Controller('ai/word-card')
export class AiWordCardController {
  constructor(private readonly service: AiWordCardService) {}

  /**
   * 生成单词卡片。
   * `POST /api/ai/word-card/generate`，body 经 `GenerateWordCardDto` 校验（400）。
   * 内容安全命中 → 422（由 service 抛 `ContentUnsafeException`）。
   */
  @Post('generate')
  generate(@Body() dto: GenerateWordCardDto) {
    return this.service.generate(dto);
  }

  /**
   * 列出卡片，可选 `?status=pending|approved|rejected` 过滤。
   * `GET /api/ai/word-card`
   */
  @Get()
  list(@Query('status') status?: string) {
    if (status && !ALLOWED_STATUSES.includes(status as WordCardStatus)) {
      throw new BadRequestException({
        code: 'BAD_STATUS',
        message: 'status 必须是 pending / approved / rejected',
      });
    }
    return this.service.list(status ? (status as WordCardStatus) : undefined);
  }

  /** 批准：`POST /api/ai/word-card/:id/approve` */
  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() body: ReviewWordCardDto) {
    return this.service.approve(id, body?.reviewerNote);
  }

  /** 驳回：`POST /api/ai/word-card/:id/reject` */
  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() body: ReviewWordCardDto) {
    return this.service.reject(id, body?.reviewerNote);
  }
}
