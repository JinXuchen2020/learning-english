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
  TokenUsage,
} from './ai-provider.interface';
import { logger } from '../common/logger/logger';

/**
 * BigModel provider 抛出的异常，携带可被上层（AI-106 重试/降级）识别的
 * `statusCode` 与 `code`。
 */
export class AiProviderException extends Error {
  /** HTTP 风格状态码（401 鉴权 / 429 限流 / 5xx 接口错误 / 0 网络 / 504 超时 / 502 结构异常）。 */
  readonly statusCode?: number;
  /** Provider 原生错误码（如 BigModel 限流 1305）。 */
  readonly code?: string | number;

  constructor(
    message: string,
    opts?: { statusCode?: number; code?: string | number },
  ) {
    super(message);
    this.name = 'AiProviderException';
    this.statusCode = opts?.statusCode;
    this.code = opts?.code;
  }
}

/** 构造 BigModelProvider 时可注入的配置，便于测试与 AI-103 动态装配。 */
export interface BigModelConfig {
  /** 智谱 API key，格式 `{id}.{secret}`。缺省读 `BIGMODEL_API_KEY`。 */
  apiKey?: string;
  /** OpenAI 兼容 base URL。缺省读 `BIGMODEL_BASE_URL`。 */
  baseUrl?: string;
  /** 默认 chat 模型。缺省读 `BIGMODEL_MODEL`。 */
  model?: string;
  /** 视觉/OCR 模型。缺省读 `BIGMODEL_VISION_MODEL`。 */
  visionModel?: string;
}

/** 注入型 fetch 签名（与全局 `fetch` 一致），便于单测 mock。 */
type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_MODEL = 'glm-4.7-flash';
const DEFAULT_VISION_MODEL = 'glm-4.6v-flash';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 512;

/** BigModel / OpenAI 兼容 chat 响应的关键形状（仅取业务所需字段）。 */
interface BigModelMessage {
  content?: string;
  reasoning_content?: string;
}
interface BigModelChoice {
  message?: BigModelMessage;
}
interface BigModelUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}
interface BigModelError {
  message?: string;
  code?: string | number;
}
interface BigModelChatResponse {
  id?: string;
  model?: string;
  choices?: BigModelChoice[];
  usage?: BigModelUsage;
  error?: BigModelError;
}

/**
 * BigModel（智谱）provider —— 实现 {@link AiProvider}。
 *
 * - `chat` / `chatWithImage` 对接智谱 OpenAI 兼容端点，支持推理模型
 *   （`glm-4.7-flash`）的 `reasoning_content` 分离与视觉模型（`glm-4.6v-flash`）。
 * - `transcribe` / `assessPronunciation` / `synthesize` 在 AI-102 范围内暂无
 *   BigModel 对应能力，返回**降级结果**（不抛错，日志标记），待 AI-304/AI-305/AI-402 接入。
 * - 失败统一抛 {@link AiProviderException}（清晰 `statusCode`/`code`），重试/降级由 AI-106 编排。
 */
export class BigModelProvider implements AiProvider {
  readonly name: ProviderName = 'bigmodel';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly visionModel: string;
  private readonly fetchFn: FetchFn;

  constructor(
    config: BigModelConfig = {},
    fetchFn: FetchFn = globalThis.fetch.bind(globalThis),
  ) {
    this.apiKey = config.apiKey ?? process.env.BIGMODEL_API_KEY ?? '';
    this.baseUrl = (
      config.baseUrl ?? process.env.BIGMODEL_BASE_URL ?? DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
    this.model = config.model ?? process.env.BIGMODEL_MODEL ?? DEFAULT_MODEL;
    this.visionModel =
      config.visionModel ?? process.env.BIGMODEL_VISION_MODEL ?? DEFAULT_VISION_MODEL;
    this.fetchFn = fetchFn;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    const model = options?.model ?? this.model;
    const body = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
    };
    const data = await this.postJson(`${this.baseUrl}/chat/completions`, body, options?.timeoutMs);
    const choice = data?.choices?.[0]?.message;
    if (!choice || typeof choice.content !== 'string') {
      throw new AiProviderException('BigModel 返回结构异常：缺少 choices[0].message.content', {
        statusCode: 502,
      });
    }
    return {
      text: choice.content,
      reasoningContent: choice.reasoning_content ?? undefined,
      model: data?.model ?? model,
      usage: this.extractUsage(data?.usage),
    };
  }

  async chatWithImage(
    prompt: string,
    image: ImageInput,
    options?: ChatOptions,
  ): Promise<ChatResult> {
    const model = options?.model ?? this.visionModel;
    const dataUrl = `data:${image.mimeType};base64,${image.data}`;
    const body = {
      model,
      messages: [
        {
          role: 'user' as const,
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: options?.temperature ?? 0.3,
    };
    const data = await this.postJson(`${this.baseUrl}/chat/completions`, body, options?.timeoutMs);
    const choice = data?.choices?.[0]?.message;
    if (!choice || typeof choice.content !== 'string') {
      throw new AiProviderException('BigModel 视觉接口返回结构异常：缺少 choices[0].message.content', {
        statusCode: 502,
      });
    }
    return {
      text: choice.content,
      model: data?.model ?? model,
    };
  }

  async transcribe(_audio: AudioInput, _options?: TranscribeOptions): Promise<TranscriptResult> {
    // BigModel STT 暂未接入（AI-102 范围外），返回降级结果，由 AI-304 接入真实能力。
    logger.debug('BigModelProvider.transcribe 暂未实现，返回降级结果');
    return { text: '', confidence: 0, durationMs: 0 };
  }

  async assessPronunciation(
    _audio: AudioInput,
    referenceText: string,
    _options?: AssessOptions,
  ): Promise<ScoreResult> {
    // BigModel 发音评测暂未接入（AI-102 范围外），返回降级结果，由 AI-305 接入。
    logger.debug('BigModelProvider.assessPronunciation 暂未实现，返回降级结果');
    return {
      score: 0,
      readableText: referenceText,
      weakPhonemes: [],
      feedback: '发音评测暂不可用，请稍后再试。',
      mascotExpr: 'thinking',
    };
  }

  async synthesize(
    _text: string,
    _voice?: string,
    _options?: SynthesizeOptions,
  ): Promise<AudioResult> {
    // BigModel TTS 暂未接入（AI-102 范围外），返回降级结果，由 AI-402 接入。
    logger.debug('BigModelProvider.synthesize 暂未实现，返回降级结果');
    return { audioBase64: '', mimeType: 'audio/mp3', durationMs: 0 };
  }

  /** 统一 POST JSON + 超时 + 错误清晰化。失败抛 {@link AiProviderException}。 */
  private async postJson(
    url: string,
    body: unknown,
    timeoutMs?: number,
  ): Promise<BigModelChatResponse> {
    if (!this.apiKey) {
      throw new AiProviderException('BigModel API key 未配置（BIGMODEL_API_KEY）', {
        statusCode: 401,
      });
    }
    const signal = AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      const err = e as Error;
      if (err?.name === 'AbortError') {
        throw new AiProviderException(
          `BigModel 请求超时（>${timeoutMs ?? DEFAULT_TIMEOUT_MS}ms）`,
          { statusCode: 504 },
        );
      }
      throw new AiProviderException(`BigModel 网络请求失败：${err?.message ?? 'unknown'}`, {
        statusCode: 0,
        code: 'NETWORK',
      });
    }

    if (!res.ok) {
      await this.throwOnError(res);
    }
    return (await res.json()) as BigModelChatResponse;
  }

  /** 解析非 2xx 响应为清晰的 {@link AiProviderException}（不吞错误）。 */
  private async throwOnError(res: Response): Promise<never> {
    const status = res.status;
    let detail = '';
    try {
      const j = (await res.json()) as BigModelChatResponse;
      detail = j?.error?.message ?? '';
      if (status === 401 || status === 403) {
        throw new AiProviderException(
          `BigModel 鉴权失败（无效或过期 key）：${detail || res.statusText}`,
          { statusCode: status },
        );
      }
      if (status === 429) {
        throw new AiProviderException(`BigModel 触发限流：${detail || res.statusText}`, {
          statusCode: 429,
          code: j?.error?.code,
        });
      }
      throw new AiProviderException(`BigModel 接口错误 ${status}：${detail || res.statusText}`, {
        statusCode: status,
      });
    } catch (e) {
      if (e instanceof AiProviderException) throw e;
      // res.json() 解析失败也归为接口错误
      throw new AiProviderException(`BigModel 接口错误 ${status}：${res.statusText}`, {
        statusCode: status,
      });
    }
  }

  private extractUsage(u?: BigModelUsage): TokenUsage | undefined {
    if (!u) return undefined;
    return {
      promptTokens: u.prompt_tokens ?? 0,
      completionTokens: u.completion_tokens ?? 0,
      totalTokens: u.total_tokens ?? 0,
    };
  }
}
