import {
  AiProvider, AI_PROVIDER_TOKEN,
  ChatMessage, ChatResult, ChatOptions, ImageInput, TranscriptResult,
  TranscribeOptions, ScoreResult, AssessOptions, AudioResult, SynthesizeOptions, AudioInput,
} from './ai-provider.interface';

/**
 * StubAiProvider — 一个最小但完整的 AiProvider 实现，用于验证接口契约
 * （五个方法签名 + 返回形状）。同时为后续真实 provider 提供可参考的范式：
 * 实现接口、返回对应 Result 类型即可被业务层注入使用。
 * （注意：这是测试桩，不是被 AI-713 移除的 mock「provider 类型」。）
 */
class StubAiProvider implements AiProvider {
  readonly name: string = 'bigmodel';

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    return { text: 'echo:' + messages.map((m) => m.content).join('|'), model: options?.model };
  }

  async chatWithImage(prompt: string, image: ImageInput, options?: ChatOptions): Promise<ChatResult> {
    return { text: `img:${prompt}:${image.mimeType}`, model: options?.model };
  }

  async transcribe(audio: AudioInput, options?: TranscribeOptions): Promise<TranscriptResult> {
    return { text: 'transcript', confidence: 0.9, durationMs: 1000 };
  }

  async assessPronunciation(audio: AudioInput, referenceText: string, options?: AssessOptions): Promise<ScoreResult> {
    return { score: 100, readableText: referenceText, weakPhonemes: [], feedback: 'Great!', mascotExpr: 'cheer' };
  }

  async synthesize(text: string, voice?: string, options?: SynthesizeOptions): Promise<AudioResult> {
    return { audioBase64: 'AGFB', mimeType: 'audio/mp3', durationMs: 500 };
  }
}

describe('AiProvider interface contract (StubAiProvider)', () => {
  const provider = new StubAiProvider();

  it('exposes a name as string (real provider identity, not a fixed enum)', () => {
    expect(typeof provider.name).toBe('string');
    expect(provider.name.length).toBeGreaterThan(0);
  });

  it('chat returns ChatResult carrying text + model', async () => {
    const res = await provider.chat([{ role: 'user', content: 'hi' }], { model: 'm1' });
    expect(res.text).toContain('hi');
    expect(res.model).toBe('m1');
  });

  it('chatWithImage returns ChatResult referencing image mime', async () => {
    const res = await provider.chatWithImage('desc', { data: 'AAA', mimeType: 'image/png' });
    expect(res.text).toBe('img:desc:image/png');
  });

  it('transcribe returns TranscriptResult', async () => {
    const res = await provider.transcribe({ data: Buffer.from('x'), mimeType: 'audio/wav' });
    expect(res.text).toBe('transcript');
    expect(res.confidence).toBe(0.9);
    expect(res.durationMs).toBe(1000);
  });

  it('assessPronunciation returns ScoreResult in [0,100] with mascot', async () => {
    const res = await provider.assessPronunciation({ data: 'y', mimeType: 'audio/wav' }, 'cat');
    expect(res.score).toBe(100);
    expect(res.readableText).toBe('cat');
    expect(res.mascotExpr).toBe('cheer');
  });

  it('synthesize returns AudioResult with mimeType', async () => {
    const res = await provider.synthesize('hello', 'voice1');
    expect(res.mimeType).toBe('audio/mp3');
    expect(res.audioBase64).toBe('AGFB');
  });

  it('AI_PROVIDER_TOKEN is the injection token', () => {
    expect(AI_PROVIDER_TOKEN).toBe('AI_PROVIDER');
  });
});
