import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiChatSession } from './ai-chat-session.entity';
import { AiChatMessage } from './ai-chat-message.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatScenesService } from './chat-scenes.service';
import { ChatSafetyService, SAFETY_CLASSIFIER_TOKEN } from './chat-safety.service';
import { LlmSafetyClassifier } from './chat-safety.classifier';
import { AI_PROVIDER_TOKEN, AiProvider } from '../ai/ai-provider.interface';

/**
 * 对话陪练模块（AI-401 建表 + AI-403 聊天接口 + AI-405 场景包枚举 + AI-406 内容安全）。
 *
 * - 注册 `AiChatSession` / `AiChatMessage` 实体仓库并导出 `TypeOrmModule`，
 *   供消费方注入仓库。
 * - AI-403 扩展：注册 `ChatService` + `ChatController`，暴露
 *   `POST /api/ai/chat/messages`。
 * - AI-405 扩展：注册 `ChatScenesService`，暴露 `GET /api/ai/chat/scenes`
 *   场景包枚举（静态配置，无 DB）。
 * - AI-406 扩展：注册内容安全双保险——
 *   `SAFETY_CLASSIFIER_TOKEN`（默认 `LlmSafetyClassifier`，复用全局
 *   `AI_PROVIDER_TOKEN` 系统默认智谱 provider 做 LLM 安全判断，AI-713 去 NVIDIA env）
 *   + `ChatSafetyService`（黑名单+分类器编排）。
 * - `ChatService` 经全局 `AiModule` 的 `AI_PROVIDER_TOKEN` 注入底层
 *   provider 链（Logged(UsageLimited(Retryable(inner)))），无需本模块 import AiModule。
 *
 * 非 `@Global()`：属领域模块，按需 import，与 `PlanModule` 等同级。
 */
@Module({
  imports: [TypeOrmModule.forFeature([AiChatSession, AiChatMessage])],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatScenesService,
    {
      provide: SAFETY_CLASSIFIER_TOKEN,
      useFactory: (provider: AiProvider) => new LlmSafetyClassifier(provider),
      inject: [AI_PROVIDER_TOKEN],
    },
    ChatSafetyService,
  ],
  exports: [TypeOrmModule],
})
export class ChatModule {}
