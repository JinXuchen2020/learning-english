import { Injectable } from '@nestjs/common';
import { ChatOptions, ChatResult, ImageInput } from './ai-provider.interface';
import { ConfiguredCapabilityProvider } from './configured-capability.provider';

/**
 * VisionProvider（AI-重构：以能力命名）。
 *
 * 只负责多模态理解与 OCR（vision）能力：每次调用自行加载「声明 vision 能力」的
 * 生效配置（家长覆盖 → 系统默认 Agnes AI → Mock 安全桩）并委托。任何底层异常 →
 * 回退 Mock。
 *
 * @module ai/vision.provider
 */
@Injectable()
export class VisionProvider extends ConfiguredCapabilityProvider {
  get name(): string {
    return 'VisionProvider';
  }

  async chatWithImage(
    prompt: string,
    image: ImageInput,
    options?: ChatOptions,
  ): Promise<ChatResult> {
    const client = await this.resolveClient('vision');
    try {
      return await client.chatWithImage(prompt, image, options);
    } catch {
      return this.mock.chatWithImage(prompt, image, options);
    }
  }
}
