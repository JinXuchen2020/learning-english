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
import { AiCallLogService } from './ai-call-log.service';
import { UserIdResolver } from './usage-limited-ai-provider';
import { AiProviderException } from './ai-provider.errors';
import { logger } from '../common/logger/logger';

/** 解析「当前调用属于哪个业务模块」的钩子；入参为本次 AI 操作名（chat/transcribe/...），便于按能力归因。 */
export type ModuleTagResolver = (operation: string) => string;

/** DI token：默认返回 `'global'`（尚无 AI 控制器时，所有调用计入同一全局桶）。 */
export const AI_MODULE_TAG_RESOLVER_TOKEN = 'AI_MODULE_TAG_RESOLVER';

/** 敏感摘要默认截断长度（字符）。绝不把儿童原始长文本/音频全量写入日志或表。 */
const SNIPPET_MAX = 200;
/** 失败原因摘要截断长度（与 AiCallLogService 对齐，对应 `ai_call_logs.errorMessage` 列 text，预留省略号）。 */
const ERROR_MAX = 255;

/** 截断字符串为安全长度摘要；null/undefined 透传 null。 */
export function truncate(s: string | null | undefined, max = SNIPPET_MAX): string | null {
  if (s == null) return null;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** 从结果安全提取 token 用量（仅 chat 类结果带 usage；其余返回 0）。 */
function tokensFromUnknown(r: unknown): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} {
  const usage = (r as { usage?: Partial<ChatResult['usage']> } | null)?.usage;
  if (!usage) return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  return {
    promptTokens: usage.promptTokens ?? 0,
    completionTokens: usage.completionTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  };
}

/**
 * 给 `AiProvider` 套上 AI-108 审计层（**最外层**）：
 * - 每次调用（无论成功 / 失败 / 被配额拦截）计时后写一条审计记录：
 *   - 经 LOG-101 结构化 logger 写入 `logs/app-*.log`（即时 grep）。
 *   - 经 `AiCallLogService` 落 `ai_call_logs` 表（按用户/模块/日聚合做成本审计）。
 * - 输入/输出一律**截断摘要**（默认前 200 字符），绝不写儿童原始录音 base64 / 长文本。
 * - 多模态只记 `prompt + [image:<mime>]`，不记 base64 图片。
 * - 审计写库失败 best-effort 吞异常，绝不阻断主 AI 调用。
 *
 * 位于最外层：一次用户请求 = 一条审计（含 AI-106 重试总耗时），不会在 retry 内部重复记。
 * `name` 透传内层 provider，消费方契约不变。
 */
export class LoggedAiProvider implements AiProvider {
  readonly name: string;

  constructor(
    private readonly inner: AiProvider,
    private readonly callLog: AiCallLogService,
    private readonly resolveUserId: UserIdResolver = () => 'anonymous',
    private readonly resolveModuleTag: ModuleTagResolver = (op: string) => op,
  ) {
    this.name = inner.name;
  }

  /**
   * 统一的「计时 + 执行 + 审计落盘」编排。
   * 成功返回结果；失败先记 error 再原样抛出（审计不吞业务异常）。
   * `buildRequest` 同步构造请求摘要；`buildResponse` / `extractTokens` 仅成功时调用。
   */
  private async runLogged<T>(
    operation: string,
    buildRequest: () => string,
    run: () => Promise<T>,
    buildResponse: (r: T) => string | null,
    extractTokens: (r: T) => { promptTokens: number; completionTokens: number; totalTokens: number },
  ): Promise<T> {
    const userId = this.resolveUserId();
    const moduleTag = this.resolveModuleTag(operation);
    const provider = this.name;
    const requestSnippet = truncate(buildRequest());
    const start = Date.now();
    let status: 'ok' | 'error' = 'ok';
    let errorMessage: string | null = null;
    let errorStack: string | null = null;
    let responseSnippet: string | null = null;
    let result: T;

    try {
      result = await run();
      responseSnippet = truncate(buildResponse(result));
      return result;
    } catch (err) {
      status = 'error';
      errorMessage = truncate((err as Error)?.message ?? String(err), ERROR_MAX);
      errorStack = (err as Error)?.stack ?? null;
      throw err;
    } finally {
      const durationMs = Date.now() - start;
      const tokens = status === 'ok'
        ? extractTokens(result!)
        : { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      logger.info('[AI-CALL]', {
        provider,
        operation,
        userId,
        moduleTag,
        durationMs,
        status,
        tokens,
        request: requestSnippet,
        response: responseSnippet,
        error: errorMessage,
        errorStack,
      });
      await this.callLog
        .record({
          userId,
          provider,
          operation,
          moduleTag,
          durationMs,
          status,
          ...tokens,
          errorMessage,
          errorStack,
          requestSnippet,
          responseSnippet,
        })
        .catch(() => undefined); // 双重保险：record 内部已吞异常
    }
  }

  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    return this.runLogged<ChatResult>(
      'chat',
      () => messages.map((m) => `${m.role}:${m.content}`).join(' | '),
      () => this.inner.chat(messages, options),
      (r) => r.text,
      tokensFromUnknown,
    );
  }

  chatWithImage(
    prompt: string,
    image: ImageInput,
    options?: ChatOptions,
  ): Promise<ChatResult> {
    return this.runLogged<ChatResult>(
      'chatWithImage',
      () => `${prompt} [image:${image.mimeType}]`,
      () => this.inner.chatWithImage(prompt, image, options),
      (r) => r.text,
      tokensFromUnknown,
    );
  }

  transcribe(audio: AudioInput, options?: TranscribeOptions): Promise<TranscriptResult> {
    return this.runLogged<TranscriptResult>(
      'transcribe',
      () => `audio[${audio.mimeType}]`,
      () => this.inner.transcribe(audio, options),
      (r) => r.text,
      () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
    );
  }

  assessPronunciation(
    audio: AudioInput,
    referenceText: string,
    options?: AssessOptions,
  ): Promise<ScoreResult> {
    return this.runLogged<ScoreResult>(
      'assessPronunciation',
      () => `ref:${referenceText}`,
      () => this.inner.assessPronunciation(audio, referenceText, options),
      (r) => `score=${r.score} readable:${r.readableText}`,
      () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
    );
  }

  synthesize(
    text: string,
    voice?: string,
    options?: SynthesizeOptions,
  ): Promise<AudioResult> {
    return this.runLogged<AudioResult>(
      'synthesize',
      () => `text:${text}`,
      () => this.inner.synthesize(text, voice, options),
      (r) => `audio[${r.mimeType}]${r.durationMs != null ? ` ${r.durationMs}ms` : ''}`,
      () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
    );
  }

  /**
   * 流式透传 + 审计：迭代内层 provider 的流逐块 yield；成功/失败均在 finally 写一条审计
   * （token 计 0，因流末无 ChatResult.usage）；异常原样向上抛（审计不吞业务异常）。
   */
  async *streamChat(
    messages: ChatMessage[],
    options?: ChatOptions & { signal?: AbortSignal },
  ): AsyncIterable<string> {
    const userId = this.resolveUserId();
    const moduleTag = this.resolveModuleTag('streamChat');
    const provider = this.name;
    const requestSnippet = truncate(messages.map((m) => `${m.role}:${m.content}`).join(' | '));
    const start = Date.now();
    let status: 'ok' | 'error' = 'ok';
    let errorMessage: string | null = null;
    let errorStack: string | null = null;
    try {
      const streamFn = this.inner.streamChat?.bind(this.inner);
      if (!streamFn) {
        throw new AiProviderException('当前 provider 不支持流式生成', {
          statusCode: 400,
          code: 'STREAM_UNSUPPORTED',
        });
      }
      yield* streamFn(messages, options);
    } catch (err) {
      status = 'error';
      errorMessage = truncate((err as Error)?.message ?? String(err), ERROR_MAX);
      errorStack = (err as Error)?.stack ?? null;
      throw err;
    } finally {
      const durationMs = Date.now() - start;
      logger.info('[AI-CALL]', {
        provider,
        operation: 'streamChat',
        userId,
        moduleTag,
        durationMs,
        status,
        tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        request: requestSnippet,
        response: null,
        error: errorMessage,
        errorStack,
      });
      await this.callLog
        .record({
          userId,
          provider,
          operation: 'streamChat',
          moduleTag,
          durationMs,
          status,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          errorMessage,
          errorStack,
          requestSnippet,
          responseSnippet: null,
        })
        .catch(() => undefined);
    }
  }
}

/** 工厂：把内层 provider 包装为带审计日志的 provider。 */
export function createLoggedProvider(
  inner: AiProvider,
  callLog: AiCallLogService,
  resolveUserId: UserIdResolver = () => 'anonymous',
  resolveModuleTag: ModuleTagResolver = (op: string) => op,
): LoggedAiProvider {
  return new LoggedAiProvider(inner, callLog, resolveUserId, resolveModuleTag);
}
