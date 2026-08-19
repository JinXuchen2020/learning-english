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
import { AiUsageLimitService } from './ai-usage-limit.service';
import { AiProviderException } from './ai-provider.errors';

/** 解析「当前调用属于哪个用户」的钩子；未来由请求级 provider 注入真实 userId。 */
export type UserIdResolver = () => string;

/** DI token：默认返回 `'anonymous'`（尚无 AI 控制器时，所有调用计入同一匿名桶）。 */
export const USER_ID_RESOLVER_TOKEN = 'AI_USER_ID_RESOLVER';

/** 从 `ChatResult` 安全提取 token 用量（无则 0）。 */
function extractTokens(result: ChatResult): number {
  return result?.usage?.totalTokens ?? 0;
}

/**
 * 给 `AiProvider` 套上 AI-107 每日配额闸门：
 * - 每次调用前 `assertWithinQuota`（超限抛 429 + degraded）。
 * - 调用成功后 `recordUsage`（**仅成功计费**，失败 / 重试不计）。
 * - `name` 透传内层 provider，消费方契约不变。
 *
 * 由于本包装位于最外层，配额错误在触达 AI-106 的 `withRetry` 之前抛出，
 * 不会被当作瞬时错误重试。
 */
export class UsageLimitedAiProvider implements AiProvider {
  readonly name: string;

  constructor(
    private readonly inner: AiProvider,
    private readonly usage: AiUsageLimitService,
    private readonly resolveUserId: UserIdResolver = () => 'anonymous',
  ) {
    this.name = inner.name;
  }

  /** 统一的「配额守卫 + 执行 + 计费」编排；`tokensOf` 提取本次调用的 token 增量。 */
  private async runQuotaGuarded<T>(fn: () => Promise<T>, tokensOf: (r: T) => number): Promise<T> {
    const userId = this.resolveUserId();
    await this.usage.assertWithinQuota(userId);
    const result = await fn();
    await this.usage.recordUsage(userId, tokensOf(result));
    return result;
  }

  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    return this.runQuotaGuarded(() => this.inner.chat(messages, options), extractTokens);
  }

  chatWithImage(prompt: string, image: ImageInput, options?: ChatOptions): Promise<ChatResult> {
    return this.runQuotaGuarded(
      () => this.inner.chatWithImage(prompt, image, options),
      extractTokens,
    );
  }

  transcribe(audio: AudioInput, options?: TranscribeOptions): Promise<TranscriptResult> {
    return this.runQuotaGuarded(() => this.inner.transcribe(audio, options), () => 0);
  }

  assessPronunciation(
    audio: AudioInput,
    referenceText: string,
    options?: AssessOptions,
  ): Promise<ScoreResult> {
    return this.runQuotaGuarded(
      () => this.inner.assessPronunciation(audio, referenceText, options),
      () => 0,
    );
  }

  synthesize(
    text: string,
    voice?: string,
    options?: SynthesizeOptions,
  ): Promise<AudioResult> {
    return this.runQuotaGuarded(
      () => this.inner.synthesize(text, voice, options),
      () => 0,
    );
  }

  /**
   * 流式透传：先配额守卫（超限额抛 429），再委托内层 provider 的流；
   * 因 AsyncIterable 无法在中途拿到 token 用量，完成时 best-effort 记 0（不阻断主流程）。
   */
  async *streamChat(
    messages: ChatMessage[],
    options?: ChatOptions & { signal?: AbortSignal },
  ): AsyncIterable<string> {
    const userId = this.resolveUserId();
    await this.usage.assertWithinQuota(userId);
    const streamFn = this.inner.streamChat?.bind(this.inner);
    if (!streamFn) {
      throw new AiProviderException('当前 provider 不支持流式生成', {
        statusCode: 400,
        code: 'STREAM_UNSUPPORTED',
      });
    }
    try {
      yield* streamFn(messages, options);
    } finally {
      await this.usage.recordUsage(userId, 0).catch(() => undefined);
    }
  }
}

/** 工厂：把内层 provider 包装为带每日配额的 provider。 */
export function createUsageLimitedProvider(
  inner: AiProvider,
  usage: AiUsageLimitService,
  resolveUserId: UserIdResolver = () => 'anonymous',
): UsageLimitedAiProvider {
  return new UsageLimitedAiProvider(inner, usage, resolveUserId);
}
