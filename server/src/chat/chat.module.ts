import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiChatSession } from './ai-chat-session.entity';
import { AiChatMessage } from './ai-chat-message.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';

/**
 * 对话陪练模块（AI-401 建表 + AI-403 聊天接口）。
 *
 * - 注册 `AiChatSession` / `AiChatMessage` 实体仓库并导出 `TypeOrmModule`，
 *   供消费方注入仓库。
 * - AI-403 扩展：注册 `ChatService` + `ChatController`，暴露
 *   `POST /api/ai/chat/messages`。
 * - `ChatService` 经全局 `AiModule` 的 `AI_PROVIDER_TOKEN` 注入底层
 *   provider 链（Logged(UsageLimited(Retryable(inner)))），无需本模块 import AiModule。
 *
 * 非 `@Global()`：属领域模块，按需 import，与 `PlanModule` 等同级。
 */
@Module({
  imports: [TypeOrmModule.forFeature([AiChatSession, AiChatMessage])],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [TypeOrmModule],
})
export class ChatModule {}
