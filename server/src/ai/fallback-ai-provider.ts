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
  UnsupportedMethodError,
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
 *
 * **通用链 vs TTS 链（AI-407 回归修复）**：
 * - `chat` / `chatWithImage` / `transcribe` / `assessPronunciation` 只走「通用链」
 *   （`providers`，即真实 LLM/STT provider）。
 * - `synthesize` 走「TTS 链」（`ttsProviders`，缺省等于通用链），可额外挂 TTS 专用
 *   provider（如本地 `EdgeTtsProvider`）作为最终兜底。
 * - 严禁把 TTS 专用 provider 放进通用链：否则上游 chat 失败时 `tryChain` 会落到它的
 *   `chat()` 上抛「unsupported」，把真实错误（网络/5xx/配额）盖掉，导致排查困难。
 */
export class FallbackAiProvider implements AiProvider {
  readonly name: ProviderName;

  /**
   * @param providers    通用链：chat/transcribe/assess 等所有非 TTS 能力按顺序尝试。
   * @param ttsProviders 仅用于 `synthesize` 的链；缺省回退到 `providers`。
   *                      通常 = `[...providers, EdgeTtsProvider]`，让 TTS 专用兜底只作用于语音合成。
   */
  constructor(
    private readonly providers: AiProvider[],
    private readonly ttsProviders?: AiProvider[],
  ) {
    this.name = providers[0]?.name ?? 'bigmodel';
  }

  /** 按序尝试给定链上的 providers，返回首个成功；全失败抛最后一个真实错误。 */
  private async tryChain<T>(
    fn: (p: AiProvider) => Promise<T>,
    providers: AiProvider[] = this.providers,
  ): Promise<T> {
    let lastErr: unknown;
    for (const p of providers) {
      try {
        return await fn(p);
      } catch (err) {
        if (err instanceof UnsupportedMethodError) {
          // 该 provider 不实现此方法（如 EdgeTts 对 chat），跳过它，
          // 不让 unsupported 盖掉真实错误，也不污染兜底链。
          continue;
        }
        lastErr = err;
      }
    }
    if (lastErr !== undefined) throw lastErr;
    // 所有 provider 都声明不支持此方法（极端情况），给出明确的 UnsupportedMethodError。
    throw new UnsupportedMethodError('没有任何 provider 支持该操作');
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
    const chain = this.ttsProviders && this.ttsProviders.length ? this.ttsProviders : this.providers;
    return this.tryChain((p) => p.synthesize(text, voice, options), chain);
  }
}
