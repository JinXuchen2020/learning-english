import { Injectable } from '@nestjs/common';
import {
  AudioInput,
  AudioResult,
  SynthesizeOptions,
} from './ai-provider.interface';
import { ConfiguredCapabilityProvider } from './configured-capability.provider';

/**
 * TtsProvider（AI-重构：以能力命名）。
 *
 * 只负责语音合成（TTS）能力：每次调用自行加载「声明 tts 能力」的生效配置
 * （家长覆盖 → 系统默认 → Mock 安全桩）并委托。若家长配置了支持 `/audio/speech`
 * 的 OpenAI 兼容 provider，则真正可用；否则走 Mock（返回空音频，前端 Web Speech 兜底朗读）。
 *
 * @module ai/tts.provider
 */
@Injectable()
export class TtsProvider extends ConfiguredCapabilityProvider {
  get name(): string {
    return 'TtsProvider';
  }

  async synthesize(
    text: string,
    voice?: string,
    options?: SynthesizeOptions,
  ): Promise<AudioResult> {
    const client = await this.resolveClient('tts');
    try {
      return await client.synthesize(text, voice, options);
    } catch {
      return this.mock.synthesize(text, voice, options);
    }
  }
}
