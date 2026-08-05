/**
 * AiTranscribeService 单测（AI-304）
 * 用 fake AiProvider 覆盖：成功(透传 words/durationMs) / 空文本降级 / 低置信降级 / provider 抛错降级不抛。
 */
import { AiTranscribeService } from './ai-transcribe.service';
import { AiProvider, AudioInput, TranscriptResult, TranscribeOptions } from './ai-provider.interface';

function makeFakeProvider() {
  const transcribeMock = jest.fn();
  const provider = {
    name: 'fake',
    chat: jest.fn(),
    chatWithImage: jest.fn(),
    transcribe: transcribeMock,
    assessPronunciation: jest.fn(),
    synthesize: jest.fn(),
  } as unknown as AiProvider;
  return { provider, transcribeMock };
}

describe('AiTranscribeService.transcribe', () => {
  const audio: AudioInput = { data: Buffer.from('fake-audio'), mimeType: 'audio/webm' };
  const opts: TranscribeOptions = { language: 'en-US' };

  it('成功转写 → 透传 words/durationMs + degraded:false', async () => {
    const { provider, transcribeMock } = makeFakeProvider();
    const wordsResult: TranscriptResult = {
      text: 'three',
      confidence: 0.9,
      words: [{ word: 'three', startMs: 0, endMs: 300, confidence: 0.9 }],
      durationMs: 300,
    };
    transcribeMock.mockResolvedValue(wordsResult);

    const svc = new AiTranscribeService(provider);
    const out = await svc.transcribe(audio, opts);

    expect(transcribeMock).toHaveBeenCalledWith(audio, opts);
    expect(out.text).toBe('three');
    expect(out.confidence).toBe(0.9);
    expect(out.words).toEqual(wordsResult.words);
    expect(out.durationMs).toBe(300);
    expect(out.degraded).toBe(false);
    expect(out.degradeReason).toBeUndefined();
  });

  it('清晰发音(Mock 确定性转写) → 非空文本 + degraded:false', async () => {
    const { provider, transcribeMock } = makeFakeProvider();
    transcribeMock.mockResolvedValue({ text: '[Mock] I see a red apple on the table.', confidence: 1 });

    const svc = new AiTranscribeService(provider);
    const out = await svc.transcribe(audio);
    expect(out.text.length).toBeGreaterThan(0);
    expect(out.degraded).toBe(false);
  });

  it('空文本 → degraded:empty', async () => {
    const { provider, transcribeMock } = makeFakeProvider();
    transcribeMock.mockResolvedValue({ text: '', confidence: 0 });

    const svc = new AiTranscribeService(provider);
    const out = await svc.transcribe(audio);
    expect(out.degraded).toBe(true);
    expect(out.degradeReason).toBe('empty');
  });

  it('低置信度 → degraded:low_confidence', async () => {
    const { provider, transcribeMock } = makeFakeProvider();
    transcribeMock.mockResolvedValue({ text: 'thr', confidence: 0.1 });

    const svc = new AiTranscribeService(provider);
    const out = await svc.transcribe(audio);
    expect(out.degraded).toBe(true);
    expect(out.degradeReason).toBe('low_confidence');
  });

  it('provider 抛错 → 降级 degraded:provider_error 且不抛异常', async () => {
    const { provider, transcribeMock } = makeFakeProvider();
    transcribeMock.mockRejectedValue(new Error('STT upstream 500'));

    const svc = new AiTranscribeService(provider);
    // 关键验收：降级不抛错
    await expect(svc.transcribe(audio, opts)).resolves.toEqual({
      text: '',
      confidence: 0,
      durationMs: 0,
      degraded: true,
      degradeReason: 'provider_error',
    });
  });
});
