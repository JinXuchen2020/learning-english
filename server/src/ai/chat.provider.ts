import { Injectable } from '@nestjs/common';
import { ChatMessage, ChatOptions, ChatResult } from './ai-provider.interface';
import { ConfiguredCapabilityProvider } from './configured-capability.provider';

/**
 * ChatProvider（AI-重构：以能力命名）。
 *
 * 只负责文本对话（LLM）能力：每次调用自行加载「声明 chat 能力」的生效配置
 * （家长覆盖 → 系统默认 Agnes AI → Mock 安全桩），用配置构建底层 client 并委托。
 * 任何底层异常 → 回退 Mock，绝不抛错。
 *
 * @module ai/chat.provider
 */
@Injectable()
export class ChatProvider extends ConfiguredCapabilityProvider {
  get name(): string {
    return 'ChatProvider';
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    const client = await this.resolveClient('chat');
    try {
      return await client.chat(messages, options);
    } catch {
      return this.mock.chat(messages, options);
    }
  }

  async *streamChat(
    messages: ChatMessage[],
    options?: ChatOptions & { signal?: AbortSignal },
  ): AsyncIterable<string> {
    const client = await this.resolveClient('chat');
    const streamFn = client.streamChat?.bind(client);
    if (!streamFn) {
      // 底层 client 不支持流式 → 回退 Mock 桩（一次性产出兜底文案块）
      yield* this.mock.streamChat(messages, options);
      return;
    }
    try {
      yield* streamFn(messages, options);
    } catch {
      // 与 chat 一致的兜底口径：底层异常回退 Mock，绝不抛错
      yield* this.mock.streamChat(messages, options);
    }
  }
}
