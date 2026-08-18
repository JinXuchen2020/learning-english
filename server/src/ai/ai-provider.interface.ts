/**
 * AiProvider — AI 能力抽象接口
 *
 * 统一封装 LLM 对话 / 多模态理解 / 语音转写(STT) / 发音评测 / 语音合成(TTS)
 * 五类能力，使 Agnes / OpenAI / 智谱 等具体 provider 可插拔替换，
 * 业务模块（plan / speech / conversation / report）只依赖本接口，不绑定厂商。
 *
 * 这是 M1 基建的第一块（见 `features/backlog.md` AI-101）。
 * 接口保持"纯契约"：不含重试/降级逻辑（重试在 AI-106 的调用层封装），
 * 不含任何具体 provider 依赖。
 *
 * @module ai/ai-provider.interface
 */

/** 对话角色，与 OpenAI 消息协议对齐。 */
export type ChatRole = 'system' | 'user' | 'assistant';

/** 单条对话消息。 */
export interface ChatMessage {
  /** 消息角色。 */
  role: ChatRole;
  /** 消息文本（多模态场景的纯文本 prompt 也走 content）。 */
  content: string;
}

/** Token 用量统计，用于成本审计（AI-108）。 */
export interface TokenUsage {
  /** 输入 prompt 消耗的 token 数。 */
  promptTokens: number;
  /** 输出 completion 消耗的 token 数。 */
  completionTokens: number;
  /** 合计 token 数。 */
  totalTokens: number;
}

/** LLM 对话结果。 */
export interface ChatResult {
  /** 最终回复文本。推理模型（如 GLM-4.7-Flash）只取 `content`，忽略 `reasoning_content`。 */
  text: string;
  /**
   * 推理模型思考链（可选）。仅部分推理模型返回，
   * provider 实现负责从原始响应中提取，业务层一般不直接展示。
   */
  reasoningContent?: string;
  /** 实际使用的模型标识，便于排查与成本归因。 */
  model?: string;
  /** 终止原因（`choices[0].finish_reason`），如 `stop` / `length`（被 max_tokens 截断）。业务层据此判断是否截断。 */
  finishReason?: string;
  /** Token 用量（若 provider 返回）。 */
  usage?: TokenUsage;
}

/** 吉祥物表情，驱动前端狐狸反馈动画（AI-306 / AI-403）。 */
export type MascotExpression = 'happy' | 'encourage' | 'thinking' | 'cheer';

/** 转写单词级时间轴，供发音评测对齐（AI-304 / AI-305）。 */
export interface TranscriptWord {
  /** 单词文本。 */
  word: string;
  /** 起始时间（毫秒，相对音频头）。 */
  startMs: number;
  /** 结束时间（毫秒）。 */
  endMs: number;
  /** 该词置信度 [0,1]，可选。 */
  confidence?: number;
}

/** 语音转写(STT)结果。 */
export interface TranscriptResult {
  /** 转写出的完整文本。 */
  text: string;
  /** 整体置信度 [0,1]，可选。 */
  confidence?: number;
  /** 单词级时间轴，可选（部分 STT 引擎不返回）。 */
  words?: TranscriptWord[];
  /** 音频时长（毫秒），可选。 */
  durationMs?: number;
}

/** 发音评测结果，分数区间 [0,100]。 */
export interface ScoreResult {
  /** 综合发音得分，[0,100]，60 分为默认通过线（AI-306）。 */
  score: number;
  /** 目标可读文本（含已识别/纠正后的展示文本）。 */
  readableText: string;
  /** 薄弱音素列表（IPA 或音素标记），供前端高亮。 */
  weakPhonemes: string[];
  /** 面向儿童的鼓励性反馈文案。 */
  feedback: string;
  /** 吉祥物反馈表情，驱动庆祝/鼓励动画。 */
  mascotExpr: MascotExpression;
}

/** TTS / 音频合成结果。 */
export interface AudioResult {
  /** base64 音频数据（不含 `data:` 前缀）。与 `audioUrl` 二选一。 */
  audioBase64?: string;
  /** 可访问的音频 URL（provider 托管时返回）。与 `audioBase64` 二选一。 */
  audioUrl?: string;
  /** 音频 MIME 类型，如 `audio/mp3`、`audio/wav`、`audio/ogg`。 */
  mimeType: string;
  /** 音频时长（毫秒），可选。 */
  durationMs?: number;
}

/** 图片输入（多模态/OCR），base64 不含 `data:` 前缀。 */
export interface ImageInput {
  /** base64 编码的图片数据。 */
  data: string;
  /** 图片 MIME 类型，如 `image/jpeg`、`image/png`。 */
  mimeType: string;
}

/** 音频输入（STT / 发音评测 / TTS 源）。 */
export interface AudioInput {
  /** 音频二进制（Buffer）或 base64 字符串（不含 `data:` 前缀）。 */
  data: Buffer | string;
  /** 音频 MIME 类型，如 `audio/webm`、`audio/wav`、`audio/mp4`。 */
  mimeType: string;
}

/** 对话通用可选参数。 */
export interface ChatOptions {
  /** 采样温度，[0,2]，越低越确定。儿童场景默认低温度。 */
  temperature?: number;
  /** 最大生成 token 数（推理模型建议 ≥512，避免 content 被截断）。 */
  maxTokens?: number;
  /** 超时时间（毫秒），须小于 Vercel serverless maxDuration（默认 60s，留 10s 余量给重试/解析/审计）。 */
  timeoutMs?: number;
  /** 指定模型覆盖（如 `AGNES_MODEL` / `OPENAI_MODEL`）。 */
  model?: string;
  /**
   * 本次调用的重试次数覆盖（含首次）。仅 `RetryableAiProvider` 生效，缺省沿用全局
   * `DEFAULT_RETRY_OPTIONS.maxAttempts`（默认 3）。
   *
   * 用于「失败即优雅降级」的端点（如绘本生成，AI 不可达直接落模板绘本），
   * 设为 1 可跳过重试、缩短降级等待。瞬时错误敏感端点（plan/report/speech）保持缺省。
   */
  maxAttempts?: number;
  /**
   * 透传额外请求体（与 provider 构造时的 `extraBody` 深一层合并，调用层优先）。
   * 典型用途：覆盖种子配置里的 `chat_template_kwargs.enable_thinking`（如 plan 生成关闭思考链以提速防截断）。
   * 注意：合并为浅合并，嵌套对象（如 `chat_template_kwargs`）整体被调用层值覆盖。
   */
  extraBody?: Record<string, unknown>;
}

/** 转写可选参数。 */
export interface TranscribeOptions {
  /** 期望输出语言代码，如 `en-US`。 */
  language?: string;
  /** 超时时间（毫秒）。 */
  timeoutMs?: number;
}

/** 发音评测可选参数。 */
export interface AssessOptions {
  /** 期望语言代码。 */
  language?: string;
  /** 通过分数线，默认 60。 */
  passLine?: number;
  /** 超时时间（毫秒）。 */
  timeoutMs?: number;
}

/** TTS 合成可选参数。 */
export interface SynthesizeOptions {
  /** 指定音色（provider 自有 voice id）。 */
  voice?: string;
  /** 语速，1.0 为正常。 */
  speed?: number;
  /** 超时时间（毫秒）。 */
  timeoutMs?: number;
}

/**
 * AI 能力提供方统一抽象。
 *
 * 历史实现（bigmodel / nvidia / azure / edge-tts）按「配置/传输类型」命名，由
 * `ProviderConfigService.buildProvider` 构建后塞进单一兜底链。AI-重构后改为
 * **按能力命名**的 provider（Chat/Vision/Stt/Tts/Pronunciation），各自在调用时
 * 从 `ProviderConfigService` 按能力加载生效配置，由 `AiCapabilityHub` 聚合后通过
 * `AI_PROVIDER_TOKEN` 注入业务模块。本接口仍是消费方依赖的稳定契约。
 */
export interface AiProvider {
  /**
   * Provider 标识（运行时真实名，如 `ChatProvider` / `AiCapabilityHub` /
   * 底层 `Agnes AI`）。改为 `string` 以携带真实 provider 名，便于审计归因。
   */
  readonly name: string;

  /**
   * 通用文本对话（LLM）。
   * @param messages 多轮对话消息（含 system / user / assistant）
   * @param options 可选采样/超时/模型参数
   * @returns 对话结果 {@link ChatResult}
   */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;

  /**
   * 多模态理解与 OCR（如 GLM-4.6V-Flash）。
   * @param prompt 文本指令（如 "识别图中的物体并用英文命名"）
   * @param image 图片输入（base64）
   * @param options 可选参数
   * @returns 理解/识别结果 {@link ChatResult}
   */
  chatWithImage(prompt: string, image: ImageInput, options?: ChatOptions): Promise<ChatResult>;

  /**
   * 语音转写（STT）。
   * @param audio 音频输入
   * @param options 可选语言/超时
   * @returns 转写结果 {@link TranscriptResult}
   */
  transcribe(audio: AudioInput, options?: TranscribeOptions): Promise<TranscriptResult>;

  /**
   * 发音评测（音素级打分）。
   * @param audio 用户朗读音频
   * @param referenceText 目标文本（单词或句子）
   * @param options 可选语言/通过线/超时
   * @returns 评测结果 {@link ScoreResult}
   */
  assessPronunciation(audio: AudioInput, referenceText: string, options?: AssessOptions): Promise<ScoreResult>;

  /**
   * 语音合成（TTS）。
   * @param text 待合成文本
   * @param voice 可选音色
   * @param options 可选语速/超时
   * @returns 合成音频 {@link AudioResult}
   */
  synthesize(text: string, voice?: string, options?: SynthesizeOptions): Promise<AudioResult>;

  /**
   * 流式对话（可选能力）。逐 delta 产出 `content` 文本，便于前端做「正在生成…」渐进展示。
   * - 不支持的 provider 可不实现（本接口为可选方法），消费方需先判空再调用。
   * - 底层 `finish_reason==='length'`（被 `max_tokens` 截断）时，实现方可抛
   *   `AiProviderException`（`code:'PLAN_TRUNCATED'`），由消费方（如 `PlanService`）映射为
   *   error 事件而非静默截断；其它 provider 基础设施异常原样向上抛。
   * - 取消：经 `options.signal` 透传到 fetch，前端 `AbortController.abort()` 可中断流。
   * @param messages 多轮对话消息
   * @param options 可选采样/超时/模型 + `signal`（取消信号）
   * @returns 逐 delta 的 `content` 文本异步迭代器
   */
  streamChat?(messages: ChatMessage[], options?: ChatOptions & { signal?: AbortSignal }): AsyncIterable<string>;
}

/** NestJS 注入 token，业务模块用 `@Inject(AI_PROVIDER_TOKEN)` 获取 AiProvider。 */
export const AI_PROVIDER_TOKEN = 'AI_PROVIDER';

/**
 * 标记「该底层 client 不实现当前能力」（如某 OpenAI 兼容端点未启用 vision）。
 * `OpenAiCompatibleProvider.assertCapability` 据此抛此错误，调用方（能力 provider）
 * 捕获后回退 Mock 安全桩，而非当作失败冒泡——避免未声明能力的调用导致 500。
 */
export class UnsupportedMethodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedMethodError';
  }
}
