import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiChatSession } from './ai-chat-session.entity';
import { AiChatMessage } from './ai-chat-message.entity';

/**
 * 对话陪练数据模块（AI-401 建表）。
 *
 * 注册 `AiChatSession` / `AiChatMessage` 实体仓库并导出 `TypeOrmModule`，供
 * 消费方（AI-403 聊天接口、AI-407 会话 UI、AI-408 星标、AI-409 历史续聊）
 * 直接注入 `getRepositoryToken(AiChatSession)` / `getRepositoryToken(AiChatMessage)`。
 *
 * 非 `@Global()`：属领域模块，按需 import，与 `PlanModule` 等同级。
 * 本 feature 仅做实体建表 + 仓库注册（控制器/服务由 AI-403 扩展），不越界。
 */
@Module({
  imports: [TypeOrmModule.forFeature([AiChatSession, AiChatMessage])],
  exports: [TypeOrmModule],
})
export class ChatModule {}
