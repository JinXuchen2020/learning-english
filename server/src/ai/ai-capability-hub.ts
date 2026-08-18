import {
  AiProvider,
  ChatMessage,
  ChatOptions,
  ChatResult,
  ImageInput,
  TranscriptResult,
  TranscribeOptions,
  ScoreResult,
  AssessOptions,
  AudioResult,
  SynthesizeOptions,
  AudioInput,
} from './ai-provider.interface';
import { ChatProvider } from './chat.provider';
import { VisionProvider } from './vision.provider';
import { SttProvider } from './stt.provider';
import { TtsProvider } from './tts.provider';
import { PronunciationProvider } from './pronunciation.provider';

/**
 * AI 能力聚合中枢（AI-重构）。
 *
 * 对消费方（chat / plan / report / mascot / picture-book / scan / word-card 等）
 * 透明实现 `AiProvider` 接口，仍通过 `@Inject(AI_PROVIDER_TOKEN)` 注入；内部把每个
 * 方法**分发到对应能力 provider**（Chat/Vision/Stt/Tts/Pronunciation），实现
 * 「按能力解耦、各自加载配置」。
 *
 * 跨切面关注点（重试由能力 provider 内真实 client 承担；配额/审计由本中枢外层的
 * `createAuditedProvider` 包装承担）保持与历史一致，不重复套用。
 *
 * @module ai/ai-capability-hub
 */
export class AiCapabilityHub implements AiProvider {
  constructor(
    private readonly chatProvider: ChatProvider,
    private readonly visionProvider: VisionProvider,
    private readonly sttProvider: SttProvider,
    private readonly ttsProvider: TtsProvider,
    private readonly pronunciationProvider: PronunciationProvider,
  ) {}

  get name(): string {
    return 'AiCapabilityHub';
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    return this.chatProvider.chat(messages, options);
  }

  async chatWithImage(
    prompt: string,
    image: ImageInput,
    options?: ChatOptions,
  ): Promise<ChatResult> {
    return this.visionProvider.chatWithImage(prompt, image, options);
  }

  async transcribe(audio: AudioInput, options?: TranscribeOptions): Promise<TranscriptResult> {
    return this.sttProvider.transcribe(audio, options);
  }

  async assessPronunciation(
    audio: AudioInput,
    referenceText: string,
    options?: AssessOptions,
  ): Promise<ScoreResult> {
    return this.pronunciationProvider.assessPronunciation(audio, referenceText, options);
  }

  async synthesize(
    text: string,
    voice?: string,
    options?: SynthesizeOptions,
  ): Promise<AudioResult> {
    return this.ttsProvider.synthesize(text, voice, options);
  }
}
