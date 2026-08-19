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

/**
 * Mock AI provider（安全桩，AI-重构核心）。
 *
 * 当某能力在 DB 中**无对应 provider 配置**时，由能力 provider（Chat/Vision/Stt/Tts）
 * 在 `resolveClient` 解析失败时兜底使用，返回安全的确定性结果，**绝不抛错**，
 * 保证 UI 不崩、可演示——替代原先「空 key provider 调用即失败」的硬错误
 * （即 stt 报「没有任何 provider 支持该操作」的根因）。
 *
 * 设计点：
 * - `transcribe` 返回空文本 → 下游 `AiTranscribeService` 识别为降级（`degraded`），发音评分走相似度兜底；
 * - `assessPronunciation` 返回 0 分 + 说明文案，而非抛错；
 * - `synthesize` 返回空音频，由前端 Web Speech 兜底朗读；
 * - `chat` / `chatWithImage` 返回固定友好文案，避免页面空白。
 */
const MOCK_NAME = 'Mock AI';
const CHAT_FALLBACK = 'AI 助手暂时不可用，请稍后再试。';
const VISION_FALLBACK = '暂时无法识别图片内容。';
const PRONUNCIATION_UNAVAILABLE = '发音评测功能暂未配置，无法评分。';

export class MockAiProvider implements AiProvider {
  readonly name: string = MOCK_NAME;

  async chat(_messages: ChatMessage[], _options?: ChatOptions): Promise<ChatResult> {
    return { text: CHAT_FALLBACK, model: MOCK_NAME };
  }

  async chatWithImage(
    _prompt: string,
    _image: ImageInput,
    _options?: ChatOptions,
  ): Promise<ChatResult> {
    return { text: VISION_FALLBACK, model: MOCK_NAME };
  }

  async transcribe(_audio: AudioInput, _options?: TranscribeOptions): Promise<TranscriptResult> {
    return { text: '', confidence: 0 };
  }

  async assessPronunciation(
    _audio: AudioInput,
    referenceText: string,
    _options?: AssessOptions,
  ): Promise<ScoreResult> {
    return {
      score: 0,
      readableText: referenceText,
      weakPhonemes: [],
      feedback: PRONUNCIATION_UNAVAILABLE,
      mascotExpr: 'encourage',
    };
  }

  async synthesize(
    _text: string,
    _voice?: string,
    _options?: SynthesizeOptions,
  ): Promise<AudioResult> {
    return { audioBase64: '', mimeType: 'audio/mpeg' };
  }

  async *streamChat(
    _messages: ChatMessage[],
    _options?: ChatOptions & { signal?: AbortSignal },
  ): AsyncIterable<string> {
    // 安全桩：一次性产出兜底文案块（非 plan 合法 JSON，下游 extractJson 会判非法 → error 事件，
    // 与 chat 口径一致——保证 UI 不崩、可演示，不静默掩盖）。
    yield CHAT_FALLBACK;
  }
}
