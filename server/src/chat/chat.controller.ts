import { Controller, Post, Get, Body, HttpException, HttpStatus } from '@nestjs/common';
import { ChatService, ChatSendResponse } from './chat.service';
import { ChatMessageDto } from './chat-message.dto';
import { ChatError } from './chat.errors';
import { ChatScenesService } from './chat-scenes.service';
import { SceneSummary } from './chat-scenes';
import { logger } from '../common/logger/logger';

/**
 * 对话陪练聊天控制器（AI-403 建 messages，AI-405 增 scenes 枚举）。
 *
 * 路由（全局前缀 `api`）：
 * - `POST /api/ai/chat/messages`：发送一条发言并取回狐狸回复（AI-403）。
 * - `GET  /api/ai/chat/scenes`：枚举全部场景包摘要（AI-405），供前端 `/chat`
 *   场景卡选择 + 起始语 + 目标词汇。
 *
 * 两个接口均**不加** `JwtAuthGuard`（鉴权推迟，与本仓库全部 AI 接口口径一致）。
 */
@Controller('ai/chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly chatScenes: ChatScenesService,
  ) {}

  @Post('messages')
  async messages(@Body() dto: ChatMessageDto): Promise<ChatSendResponse> {
    try {
      return await this.chat.sendMessage(dto);
    } catch (err) {
      if (err instanceof ChatError) {
        throw new HttpException(
          { code: err.code, message: err.message },
          err.status as HttpStatus,
        );
      }
      logger.error('[ChatController] 聊天失败', err as Error);
      throw err;
    }
  }

  /**
   * 枚举全部场景包摘要（AI-405）。
   * @returns 场景摘要数组（id/title/openingLine/targetVocabulary，不含 systemPrompt）。
   */
  @Get('scenes')
  scenes(): SceneSummary[] {
    return this.chatScenes.list();
  }
}
