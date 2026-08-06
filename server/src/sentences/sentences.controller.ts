import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SentencesService, SentenceQuery } from './sentences.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

/**
 * 句子跟读库控制器（AI-309）。
 *
 * 路由（全局前缀 `api`）：`GET /api/sentences`
 *  - 查询参数（可选）：`level`（分级 L1/L2/L3）、`wordText`（关联词汇文本过滤）。
 *  - 与 `WordsController` 同口径加 `JwtAuthGuard`：句库属教学内容，需登录后拉取；
 *    前端 `request()` 默认带内存 token，E2E 已登录，不影响既有旅程。
 */
@Controller('sentences')
@UseGuards(JwtAuthGuard)
export class SentencesController {
  constructor(private readonly sentencesService: SentencesService) {}

  @Get()
  findAll(
    @Query('level') level?: string,
    @Query('wordText') wordText?: string,
  ) {
    const query: SentenceQuery = {};
    if (level && level.trim().length > 0) query.level = level.trim();
    if (wordText && wordText.trim().length > 0) query.wordText = wordText.trim();
    return this.sentencesService.findAll(query);
  }
}
