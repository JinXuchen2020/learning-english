import { Injectable } from '@nestjs/common';
import { AudioInput, TranscriptResult, TranscribeOptions } from './ai-provider.interface';
import { ConfiguredCapabilityProvider } from './configured-capability.provider';

/**
 * SttProvider（AI-重构：以能力命名）。
 *
 * 只负责语音转写（STT）能力：每次调用自行加载「声明 stt 能力」的生效配置
 * （家长覆盖 → 系统默认 → Mock 安全桩）并委托。若家长配置了支持 whisper 的
 * OpenAI 兼容 provider，则真正可用；否则走 Mock（返回空文本，下游发音评分走相似度兜底）。
 *
 * @module ai/stt.provider
 */
@Injectable()
export class SttProvider extends ConfiguredCapabilityProvider {
  get name(): string {
    return 'SttProvider';
  }

  async transcribe(audio: AudioInput, options?: TranscribeOptions): Promise<TranscriptResult> {
    const client = await this.resolveClient('stt');
    try {
      return await client.transcribe(audio, options);
    } catch {
      return this.mock.transcribe(audio, options);
    }
  }
}
