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
 * MockAiProvider —— 确定性假数据 provider（AI-103 建立的基线实现）。
 *
 * 用途：
 * - 当 `AI_PROVIDER` 缺失 / 为 `mock` / 或未实现的 `nvidia`·`azure` 时，
 *   `AiModule` 用它注册，保证「无 key 时应用可启动」且前端可跑通全流程演示。
 * - 返回**确定性**结果，便于开发与单测，不依赖任何外部 API。
 *
 * 与 AI-104 的关系：AI-104 计划在其基础上扩展更丰富的固定 plan/报告夹具，
 * 本文件即其基线，不另造类（详见 `features/ai-103.md` §5 边界说明）。
 */
export class MockAiProvider implements AiProvider {
  readonly name: ProviderName = 'mock';

  async chat(messages: ChatMessage[], _options?: ChatOptions): Promise<ChatResult> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const echo = lastUser ? lastUser.content : '';
    return {
      text: `[Mock] 收到 ${messages.length} 条消息，这是模拟回复。最后用户输入：${echo || '(空)'}`,
      model: 'mock-model',
    };
  }

  async chatWithImage(
    prompt: string,
    image: ImageInput,
    _options?: ChatOptions,
  ): Promise<ChatResult> {
    return {
      text: `[Mock] 已识别图片(${image.mimeType}, ${image.data.length} bytes)，这是模拟理解结果。指令：${prompt}`,
      model: 'mock-vision-model',
    };
  }

  async transcribe(_audio: AudioInput, _options?: TranscribeOptions): Promise<TranscriptResult> {
    return {
      text: '[Mock] 模拟转写文本',
      confidence: 1,
      durationMs: 0,
    };
  }

  async assessPronunciation(
    _audio: AudioInput,
    referenceText: string,
    _options?: AssessOptions,
  ): Promise<ScoreResult> {
    return {
      score: 100,
      readableText: referenceText,
      weakPhonemes: [],
      feedback: '[Mock] 模拟发音评测：完美！',
      mascotExpr: 'cheer',
    };
  }

  async synthesize(
    text: string,
    _voice?: string,
    _options?: SynthesizeOptions,
  ): Promise<AudioResult> {
    return {
      audioBase64: '',
      mimeType: 'audio/mp3',
      durationMs: 0,
    };
  }
}
