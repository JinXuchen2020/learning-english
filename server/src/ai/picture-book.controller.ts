import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { PictureBookService } from './picture-book.service';
import type { PictureBookResponse } from './picture-book.service';

/** `POST /api/ai/picture-book/tts` 请求体。 */
export class PictureBookTtsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000, { message: '文本过长（≤2000 字符）' })
  text: string;
}

/**
 * AI 绘本控制器（AI-604）。
 *
 * 路由（全局前缀 `api`）：
 *  - `GET  /api/ai/picture-book?userId=&courseId=`  获取/生成该课程绘本（幂等）
 *  - `POST /api/ai/picture-book/tts`  body `{ text }`  合成朗读音频 URL
 *
 * 鉴权：与 AI 模块约定一致（无 `JwtAuthGuard`，`userId` 由 query 传入），已知限制
 * （继承自 AI 模块）：userId 客户端传入、未做租户隔离，待全局鉴权落地后统一收紧。
 */
@Controller('ai/picture-book')
export class PictureBookController {
  constructor(private readonly bookService: PictureBookService) {}

  @Get('story')
  async story(
    @Query('userId') userId: string,
    @Query('courseId') courseId?: string,
  ): Promise<PictureBookResponse> {
    return this.bookService.getOrGenerateBook(userId, courseId);
  }

  @Post('tts')
  async tts(@Body() dto: PictureBookTtsDto): Promise<{ ttsUrl: string | null }> {
    return this.bookService.synthesizeTts(dto.text);
  }
}
