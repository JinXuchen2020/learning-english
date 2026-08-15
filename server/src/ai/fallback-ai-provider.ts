import {
  AiProvider,
  ProviderName,
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

/**
 * 跨 provider 兜底链（AI-713 续）。
 *
 * 把一组「已各自套好 重试/配额/日志 链」的 provider 按优先级串成单一 `AiProvider`：
 * 每次方法调用依次尝试，任一成功即返回；全部失败则抛出最后一个错误。
 *
 * 用途：系统默认 provider 链 —— 主用 Agnes AI，失败时自动切到智谱兜底，
 * 对调用方（`AiProviderRouter`）透明。注意：
 * - 每个内层 provider 自身已含 `RetryableAiProvider`（主用会先退避重试 3 次），
 *   本链仅在「主用穷尽重试仍失败」后才降级到下一个 provider，避免无意义快速切换。
 * - `assessPronunciation` 等「通用 OpenAI 不提供」的能力会以降级结果返回（不抛错），
 *   链不会因此误切；真正的失败（401/超时/网络/5xx）才会触发兜底。
 */
export class FallbackAiProvider implements AiProvider {
  readonly name: ProviderName;

  constructor(private readonly providers: AiProvider[]) {
    this.name = providers[0]?.name ?? 'bigmodel';
  }

  /** 按序尝试 providers，返回首个成功；全失败抛最后一个错误。 */
  private async tryChain<T>(fn: (p: AiProvider) => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (const p of this.providers) {
      try {
        return await fn(p);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    return this.tryChain((p) => p.chat(messages, options));
  }

  async chatWithImage(
    prompt: string,
    image: ImageInput,
    options?: ChatOptions,
  ): Promise<ChatResult> {
    return this.tryChain((p) => p.chatWithImage(prompt, image, options));
  }

  async transcribe(audio: AudioInput, options?: TranscribeOptions): Promise<TranscriptResult> {
    return this.tryChain((p) => p.transcribe(audio, options));
  }

  async assessPronunciation(
    audio: AudioInput,
    referenceText: string,
    options?: AssessOptions,
  ): Promise<ScoreResult> {
    return this.tryChain((p) => p.assessPronunciation(audio, referenceText, options));
  }

  async synthesize(
    text: string,
    voice?: string,
    options?: SynthesizeOptions,
  ): Promise<AudioResult> {
    return this.tryChain((p) => p.synthesize(text, voice, options));
  }
}
