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
  UnsupportedMethodError,
} from '../ai-provider.interface';
import { AiProviderException, AiAccessError } from '../bigmodel.provider';
import { ProviderCapability } from './provider-config.entity';

/** 注入型 fetch 签名（与全局 `fetch` 一致），便于单测 mock。 */
export type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_TTS_TIMEOUT_MS = 30_000;

interface OaMessage {
  content?: string;
  reasoning_content?: string;
}
interface OaChoice {
  message?: OaMessage;
}
interface OaUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}
interface OaError {
  message?: string;
  code?: string | number;
}
interface OaChatResponse {
  id?: string;
  model?: string;
  choices?: OaChoice[];
  usage?: OaUsage;
  error?: OaError;
}

/**
 * OpenAI 兼容 provider（AI-705）。
 *
 * 统一对接标准 OpenAI 兼容端点（智谱 / OpenAI / DeepSeek / Qwen 等共用
 * `/chat/completions` / `/audio/transcriptions` / `/audio/speech` 形状）：
 * - `chat` / `chatWithImage` → `/chat/completions`（vision 走 `image_url` 数组）。
 * - `transcribe` → `/audio/transcriptions`（multipart）。
 * - `synthesize` → `/audio/speech`（返回音频二进制 / base64）。
 * - `assessPronunciation` → **通用 OpenAI 不提供发音评测**，返回 unsupported 降级；
 *   由解析器在需要时回退默认 provider 的该项能力。
 *
 * 错误分类沿用 `AiProviderException`（`statusCode`/`code`），重试 / 降级由 AI-106 复用。
 * `fetchFn` 可注入，便于单测 mock。
 */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  /** 单一模型字段（AI-714）：一个 provider 配置 = 一个模型，能力由该模型验证。 */
  private readonly model: string;
  /** 透传额外请求体（如 chat_template_kwargs / enable_thinking）。 */
  private readonly extraBody: Record<string, unknown>;
  /** 显式声明的能力集；null/空 → 视为全能力（向后兼容 seed 系统 provider）。 */
  private readonly capabilities: ProviderCapability[] | null;
  private readonly fetchFn: FetchFn;

  constructor(
    config: {
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      extraBody?: Record<string, unknown>;
      /** 声明的能力（AI-714）：非空时未声明能力直接抛 UnsupportedMethodError。 */
      capabilities?: ProviderCapability[] | null;
      /** 运行时真实 provider 名（来自 DB `ProviderConfig.name`，如 `Agnes AI`），用于审计归因。缺省 `bigmodel`。 */
      name?: string;
    } = {},
    fetchFn: FetchFn = globalThis.fetch.bind(globalThis),
  ) {
    this.apiKey = config.apiKey ?? '';
    this.baseUrl = (config.baseUrl ?? '').replace(/\/+$/, '');
    this.model = config.model ?? 'gpt-4o-mini';
    this.extraBody = config.extraBody ?? {};
    this.capabilities = config.capabilities ?? null;
    this.name = config.name ?? 'bigmodel';
    this.fetchFn = fetchFn;
  }

  /** 能力边界断言：capabilities 为非空数组且未声明该能力 → 抛 UnsupportedMethodError（让兜底链跳过）。空数组/null 视为「全部能力」（向后兼容 seed 系统 provider，且与 AI 模块「空 caps=全部」约定一致）。 */
  private assertCapability(cap: ProviderCapability): void {
    if (this.capabilities && this.capabilities.length > 0 && !this.capabilities.includes(cap)) {
      throw new UnsupportedMethodError(`provider ${this.name} 未声明能力 ${cap}`);
    }
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    this.assertCapability('chat');
    const model = options?.model ?? this.model;
    const body = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens ?? 512,
      ...this.extraBody,
    };
    const data = await this.postJson(`${this.baseUrl}/chat/completions`, body, options?.timeoutMs);
    const choice = data?.choices?.[0]?.message;
    if (!choice || typeof choice.content !== 'string') {
      throw new AiProviderException('OpenAI 兼容接口返回结构异常：缺少 choices[0].message.content', {
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
    this.assertCapability('vision');
    const model = options?.model ?? this.model;
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
      ...this.extraBody,
    };
    const data = await this.postJson(`${this.baseUrl}/chat/completions`, body, options?.timeoutMs);
    const choice = data?.choices?.[0]?.message;
    if (!choice || typeof choice.content !== 'string') {
      throw new AiProviderException('OpenAI 兼容视觉接口返回结构异常：缺少 choices[0].message.content', {
        statusCode: 502,
      });
    }
    return { text: choice.content, model: data?.model ?? model };
  }

  async transcribe(audio: AudioInput, options?: TranscribeOptions): Promise<TranscriptResult> {
    this.assertCapability('stt');
    const form = new FormData();
    const buf = typeof audio.data === 'string' ? Buffer.from(audio.data, 'base64') : audio.data;
    const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    form.append('file', new Blob([bytes as BlobPart], { type: audio.mimeType }), 'audio');
    form.append('model', 'whisper-1');
    if (options?.language) form.append('language', options.language);

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const signal = AbortSignal.timeout(timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal,
      });
    } catch (e) {
      const err = e as Error;
      if (err?.name === 'AbortError') {
        throw new AiProviderException(`OpenAI 兼容 STT 请求超时（>${timeoutMs}ms）`, { statusCode: 504 });
      }
      throw new AiProviderException(`OpenAI 兼容 STT 网络请求失败：${err?.message ?? 'unknown'}`, {
        statusCode: 0,
        code: 'NETWORK',
      });
    }
    if (!res.ok) await this.throwOnError(res);
    const j = (await res.json()) as { text?: string };
    return { text: j?.text ?? '', confidence: undefined, durationMs: undefined };
  }

  async assessPronunciation(
    _audio: AudioInput,
    referenceText: string,
    _options?: AssessOptions,
  ): Promise<ScoreResult> {
    // 通用 OpenAI 兼容端点不提供发音评测能力 → 标注 unsupported 降级。
    return {
      score: 0,
      readableText: referenceText,
      weakPhonemes: [],
      feedback: '该提供商不支持发音评测，请更换支持发音评测的 provider。',
      mascotExpr: 'thinking',
    };
  }

  async synthesize(
    text: string,
    voice?: string,
    options?: SynthesizeOptions,
  ): Promise<AudioResult> {
    this.assertCapability('tts');
    if (!this.apiKey) {
      throw new AiProviderException('OpenAI 兼容 API key 未配置', { statusCode: 401 });
    }
    const body = {
      model: this.model,
      input: text,
      voice: voice || 'alloy',
      response_format: 'mp3',
      speed: options?.speed ?? 1.0,
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
        throw new AiProviderException(`OpenAI 兼容 TTS 请求超时（>${timeoutMs}ms）`, { statusCode: 504 });
      }
      throw new AiProviderException(`OpenAI 兼容 TTS 网络请求失败：${err?.message ?? 'unknown'}`, {
        statusCode: 0,
        code: 'NETWORK',
      });
    }
    if (!res.ok) await this.throwOnError(res);

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const j = (await res.json()) as { audio?: string; url?: string };
      if (j?.url) return { audioUrl: j.url, mimeType: 'audio/mpeg' };
      if (j?.audio) return { audioBase64: j.audio, mimeType: 'audio/mpeg' };
      throw new AiProviderException('OpenAI 兼容 TTS 返回结构异常：缺少 audio/url 字段', { statusCode: 502 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new AiProviderException('OpenAI 兼容 TTS 返回空音频', { statusCode: 502 });
    return { audioBase64: buf.toString('base64'), mimeType: this.mimeFromContentType(contentType) };
  }

  private mimeFromContentType(contentType: string): string {
    if (contentType.includes('audio/wav') || contentType.includes('audio/x-wav')) return 'audio/wav';
    if (contentType.includes('audio/mpeg') || contentType.includes('audio/mp3')) return 'audio/mpeg';
    return 'audio/mpeg';
  }

  private async postJson(url: string, body: unknown, timeoutMs?: number): Promise<OaChatResponse> {
    if (!this.apiKey) {
      throw new AiProviderException('OpenAI 兼容 API key 未配置', { statusCode: 401 });
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
        throw new AiProviderException(`OpenAI 兼容请求超时（>${timeoutMs ?? DEFAULT_TIMEOUT_MS}ms）`, {
          statusCode: 504,
        });
      }
      throw new AiProviderException(`OpenAI 兼容网络请求失败：${err?.message ?? 'unknown'}`, {
        statusCode: 0,
        code: 'NETWORK',
      });
    }
    if (!res.ok) await this.throwOnError(res);
    return (await res.json()) as OaChatResponse;
  }

  private async throwOnError(res: Response): Promise<never> {
    const status = res.status;
    let detail = '';
    try {
      const j = (await res.json()) as OaChatResponse;
      detail = j?.error?.message ?? '';
      if (status === 401 || status === 403) {
        throw new AiAccessError(
          `OpenAI 兼容鉴权失败（key 无效或过期）：${detail || res.statusText}`,
          { statusCode: status },
        );
      }
      if (status === 429) {
        throw new AiProviderException(`OpenAI 兼容触发限流：${detail || res.statusText}`, {
          statusCode: 429,
          code: j?.error?.code,
        });
      }
      throw new AiProviderException(`OpenAI 兼容接口错误 ${status}：${detail || res.statusText}`, {
        statusCode: status,
      });
    } catch (e) {
      if (e instanceof AiProviderException) throw e;
      throw new AiProviderException(`OpenAI 兼容接口错误 ${status}：${res.statusText}`, { statusCode: status });
    }
  }

  private extractUsage(u?: OaUsage): TokenUsage | undefined {
    if (!u) return undefined;
    return {
      promptTokens: u.prompt_tokens ?? 0,
      completionTokens: u.completion_tokens ?? 0,
      totalTokens: u.total_tokens ?? 0,
    };
  }
}
