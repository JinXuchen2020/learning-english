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
  UnsupportedMethodError,
} from './ai-provider.interface';
import { withRetry, DEFAULT_RETRY_OPTIONS, AiRetryOptions } from './ai-retry';
import { ConcurrencyLimiter } from './concurrency-limiter';

/** 网络型方法（需重试 + 并发保护）与本地/降级方法（直接委托）的区分。 */
const DEFAULT_MAX_CONCURRENCY = 4;

/**
 * 给任意 `AiProvider` 套上 AI-106 韧性层：
 * - `chat` / `chatWithImage`：经并发限流 + 指数退避重试（仅对瞬时错误重试）。
 * - `transcribe` / `assessPronunciation` / `synthesize`：本地/降级方法，无网络，直接委托。
 * - `name`：透传内层 provider 标识，保证消费方契约不变。
 *
 * 业务层注入的仍是 `AiProvider` 抽象（经 `AI_PROVIDER_TOKEN`），无需感知重试存在。
 */
export class RetryableAiProvider implements AiProvider {
  readonly name: string;

  constructor(
    private readonly inner: AiProvider,
    private readonly retryOptions: Required<AiRetryOptions> = DEFAULT_RETRY_OPTIONS,
    private readonly limiter: ConcurrencyLimiter = new ConcurrencyLimiter(
      DEFAULT_MAX_CONCURRENCY,
    ),
  ) {
    this.name = inner.name;
  }

  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    return this.limiter.run(() =>
      withRetry(() => this.inner.chat(messages, options), this.resolveRetryOptions(options)),
    );
  }

  chatWithImage(
    prompt: string,
    image: ImageInput,
    options?: ChatOptions,
  ): Promise<ChatResult> {
    return this.limiter.run(() =>
      withRetry(
        () => this.inner.chatWithImage(prompt, image, options),
        this.resolveRetryOptions(options),
      ),
    );
  }

  /**
   * 流式对话（AI-804）：委托内层 provider 的 `streamChat`。
   * - 内层不支持流式 → 抛 `UnsupportedMethodError`（与 `ChatProvider.streamChat`
   *   的「底层 client 无 streamChat → 回退 Mock 桩」口径配合，绝不静默产出空流）。
   * - 不套重试/并发限流：SSE 已产出部分增量后重试会重复内容，无法原子重放；
   *   并发由调用方（业务模块）自控。
   */
  async *streamChat(
    messages: ChatMessage[],
    options?: ChatOptions & { signal?: AbortSignal },
  ): AsyncIterable<string> {
    const innerStream = this.inner.streamChat;
    if (!innerStream) {
      throw new UnsupportedMethodError(`provider ${this.inner.name} 不支持流式对话`);
    }
    yield* innerStream.call(this.inner, messages, options);
  }

  /**
   * 合并全局重试配置与调用级 `maxAttempts` 覆盖（无覆盖沿用全局）。
   * 仅允许收紧/放开单次调用的尝试次数，其余退避参数始终用全局默认。
   */
  private resolveRetryOptions(options?: ChatOptions): Required<AiRetryOptions> {
    if (options?.maxAttempts == null) return this.retryOptions;
    return { ...this.retryOptions, maxAttempts: options.maxAttempts };
  }

  transcribe(audio: AudioInput, options?: TranscribeOptions): Promise<TranscriptResult> {
    return this.inner.transcribe(audio, options);
  }

  assessPronunciation(
    audio: AudioInput,
    referenceText: string,
    options?: AssessOptions,
  ): Promise<ScoreResult> {
    return this.inner.assessPronunciation(audio, referenceText, options);
  }

  synthesize(
    text: string,
    voice?: string,
    options?: SynthesizeOptions,
  ): Promise<AudioResult> {
    return this.inner.synthesize(text, voice, options);
  }
}

/** 工厂：把内层 provider 包装为带重试/限流的 provider。 */
export function createRetryableProvider(
  inner: AiProvider,
  retryOptions?: AiRetryOptions,
  limiter?: ConcurrencyLimiter,
): RetryableAiProvider {
  return new RetryableAiProvider(
    inner,
    { ...DEFAULT_RETRY_OPTIONS, ...retryOptions },
    limiter ?? new ConcurrencyLimiter(DEFAULT_MAX_CONCURRENCY),
  );
}
