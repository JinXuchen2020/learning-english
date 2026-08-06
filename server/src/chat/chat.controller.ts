import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { ChatService, ChatSendResponse } from './chat.service';
import { ChatMessageDto } from './chat-message.dto';
import { ChatError } from './chat.errors';
import { logger } from '../common/logger/logger';

/**
 * 对话陪练聊天控制器（AI-403）。
 *
 * 路由（全局前缀 `api`）：`POST /api/ai/chat/messages`
 *  - 请求体经全局 `ValidationPipe`(whitelist+transform+forbidNonWhitelisted) 校验。
 *  - 业务委托 `ChatService`；其抛出的 {@link ChatError} 在此翻译为对应
 *    HTTP 状态码 + 机器可读 `code`。
 *
 * 按本项目 AI 接口约定（同 `AiController`），本接口**不加** `JwtAuthGuard`
 * （鉴权推迟），userId 默认 `anonymous`。
 */
@Controller('ai/chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

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
}
