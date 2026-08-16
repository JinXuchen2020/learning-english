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

/**
 * 账户权限类错误（401/403 鉴权失败、NVIDIA `404 Function not found for account` 等）。
 * 区别于瞬时错误：**不重试**，业务层应据此提示用户「检查 key / 账户权限」。
 * 由 AI-106 的错误分类 {@link classifyError} 识别为 `access`。
 */
export class AiAccessError extends AiProviderException {
  constructor(
    message: string,
    opts?: { statusCode?: number; code?: string | number },
  ) {
    super(message, opts);
    this.name = 'AiAccessError';
  }
}

/** 构造 BigModelProvider 时可注入的配置，便于测试与 AI-103 动态装配。 */
export interface BigModelConfig {
  /** 智谱 API key，格式 `{id}.{secret}`。由 DB 系统默认配置解密注入（AI-713 去 env 化）。 */
  apiKey?: string;
  /** OpenAI 兼容 base URL。缺省用 `DEFAULT_BASE_URL`（open.bigmodel.cn/api/paas/v4）。 */
  baseUrl?: string;
  /** 默认 chat 模型。缺省 `DEFAULT_MODEL`（glm-4.7-flash）。 */
  model?: string;
  /** 视觉/OCR 模型。缺省 `DEFAULT_VISION_MODEL`（glm-4.6v-flash）。 */
  visionModel?: string;
  /** TTS 模型。缺省 `DEFAULT_TTS_MODEL`（glm-tts）。 */
  ttsModel?: string;
  /** 默认 TTS 音色（狐狸吉祥物音色）。缺省 `DEFAULT_TTS_VOICE`（tongtong）。 */
  ttsVoice?: string;
  /** 运行时真实 provider 名（来自 DB `ProviderConfig.name`，如 `智谱 GLM (系统默认)`），用于审计归因。缺省 `bigmodel`。 */
  name?: string;
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
/** TTS 模型（智谱 GLM-TTS）。 */
const DEFAULT_TTS_MODEL = 'glm-tts';
/** 默认 TTS 音色：狐狸吉祥物儿童友好音色（智谱系统童声 `tongtong`）。 */
const DEFAULT_TTS_VOICE = 'tongtong';
/** TTS 单次合成超时（语音合成比 LLM 快，30s 足够）。 */
const DEFAULT_TTS_TIMEOUT_MS = 30_000;

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
  readonly name: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly visionModel: string;
  private readonly ttsModel: string;
  private readonly ttsVoice: string;
  private readonly fetchFn: FetchFn;

  constructor(
    config: BigModelConfig = {},
    fetchFn: FetchFn = globalThis.fetch.bind(globalThis),
  ) {
    this.apiKey = config.apiKey ?? '';
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.model = config.model ?? DEFAULT_MODEL;
    this.visionModel = config.visionModel ?? DEFAULT_VISION_MODEL;
    this.ttsModel = config.ttsModel ?? DEFAULT_TTS_MODEL;
    this.ttsVoice = config.ttsVoice ?? DEFAULT_TTS_VOICE;
    this.name = config.name ?? 'bigmodel';
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
    // BigModel STT 暂未接入（AI-102 范围外），必须抛错让 FallbackAiProvider 继续尝试下一个 provider。
    // 若返回空文本（不抛错），FallbackAiProvider 会把空结果当"成功"消费，导致 STT 静默失败（分数恒为 0）。
    throw new AiProviderException('智谱 GLM 暂不支持语音转写（STT），请配置支持 whisper 的 provider', {
      statusCode: 501,
      code: 'STT_NOT_SUPPORTED',
    });
  }

  async assessPronunciation(
    _audio: AudioInput,
    _referenceText: string,
    _options?: AssessOptions,
  ): Promise<ScoreResult> {
    // BigModel 发音评测暂未接入，必须抛错让 FallbackAiProvider 继续尝试下一个 provider。
    throw new AiProviderException('智谱 GLM 暂不支持发音评测', {
      statusCode: 501,
      code: 'PRONUNCIATION_NOT_SUPPORTED',
    });
  }

  async synthesize(
    text: string,
    voice?: string,
    options?: SynthesizeOptions,
  ): Promise<AudioResult> {
    if (!this.apiKey) {
      throw new AiProviderException('BigModel API key 未配置（请通过家长设置或 seed 系统默认配置）', {
        statusCode: 401,
      });
    }
    const body = {
      model: this.ttsModel,
      input: text,
      voice: voice || this.ttsVoice,
      speed: options?.speed ?? 1.0,
      volume: 1.0,
      stream: false,
    };
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TTS_TIMEOUT_MS;
    const signal = AbortSignal.timeout(timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/audio/speech`, {
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
        throw new AiProviderException(`BigModel TTS 请求超时（>${timeoutMs}ms）`, {
          statusCode: 504,
        });
      }
      throw new AiProviderException(`BigModel TTS 网络请求失败：${err?.message ?? 'unknown'}`, {
        statusCode: 0,
        code: 'NETWORK',
      });
    }

    if (!res.ok) {
      await this.throwOnError(res);
    }

    // 智谱 /audio/speech 默认返回二进制音频；少数网关/代理包 JSON 信封。
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const j = (await res.json()) as {
        audio?: string;
        url?: string;
        duration?: number;
      };
      if (j?.url) {
        return {
          audioUrl: j.url,
          mimeType: 'audio/mpeg',
          durationMs: j.duration ? Math.round(j.duration * 1000) : undefined,
        };
      }
      if (j?.audio) {
        return { audioBase64: j.audio, mimeType: 'audio/mpeg', durationMs: undefined };
      }
      throw new AiProviderException('BigModel TTS 返回结构异常：缺少 audio/url 字段', {
        statusCode: 502,
      });
    }

    // 二进制音频响应（直接返回 mp3/wav 字节）。
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) {
      throw new AiProviderException('BigModel TTS 返回空音频', { statusCode: 502 });
    }
    return {
      audioBase64: buf.toString('base64'),
      mimeType: this.mimeFromContentType(contentType),
      durationMs: undefined,
    };
  }

  /** 从响应 Content-Type 推导音频 mime（兜底 audio/mpeg，与 response_format=mp3 一致）。 */
  private mimeFromContentType(contentType: string): string {
    if (contentType.includes('audio/wav') || contentType.includes('audio/x-wav')) {
      return 'audio/wav';
    }
    if (contentType.includes('audio/pcm')) return 'audio/pcm';
    if (contentType.includes('audio/mpeg') || contentType.includes('audio/mp3')) {
      return 'audio/mpeg';
    }
    return 'audio/mpeg';
  }

  /** 统一 POST JSON + 超时 + 错误清晰化。失败抛 {@link AiProviderException}。 */
  private async postJson(
    url: string,
    body: unknown,
    timeoutMs?: number,
  ): Promise<BigModelChatResponse> {
    if (!this.apiKey) {
      throw new AiProviderException('BigModel API key 未配置（请通过家长设置或 seed 系统默认配置）', {
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
        throw new AiAccessError(
          `BigModel 鉴权失败（账户权限问题，key 无效或过期）：${detail || res.statusText}`,
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
