import { AiSpeechEvaluatorService, UploadedAudioFile } from './ai-speech-evaluator.service';
import { SpeechEvaluateError } from './speech-evaluate.validation';
import { EvaluateSpeechDto } from './speech-evaluate.dto';
import { AiProvider, ScoreResult } from './ai-provider.interface';
import { Repository } from 'typeorm';
import { Word } from '../entities/word.entity';

/** 假 AiProvider：记录 assessPronunciation 入参并返回确定性 ScoreResult。 */
function makeFakeProvider(): { provider: AiProvider; calls: any[] } {
  const calls: any[] = [];
  const provider: AiProvider = {
    name: 'mock',
    chat: jest.fn(),
    chatWithImage: jest.fn(),
    transcribe: jest.fn(),
    async assessPronunciation(audio: any, referenceText: string, options?: any) {
      calls.push({ audio, referenceText, options });
      const result: ScoreResult = {
        score: 88,
        readableText: referenceText,
        weakPhonemes: ['θ', 'v'],
        feedback: '[Mock] 很接近啦！',
        mascotExpr: 'encourage',
      };
      return result;
    },
    synthesize: jest.fn(),
  };
  return { provider, calls };
}

/** 假 Word 仓库：findOne 返回可配置结果。 */
function makeFakeWordRepo(found?: Word | null): Repository<Word> {
  return {
    findOne: jest.fn(async () => found ?? null),
  } as unknown as Repository<Word>;
}

function makeFile(over: Partial<UploadedAudioFile> = {}): UploadedAudioFile {
  return {
    buffer: Buffer.from('fake-audio-bytes'),
    mimetype: 'audio/webm',
    size: 1024,
    originalname: 'rec.webm',
    ...over,
  };
}

function makeDto(over: Partial<EvaluateSpeechDto> = {}): EvaluateSpeechDto {
  return { ...over };
}

describe('AiSpeechEvaluatorService', () => {
  it('合法 wordId → 解析 Word.text 作参考文本并调用 provider，返回 ScoreResult', async () => {
    const { provider, calls } = makeFakeProvider();
    const wordRepo = makeFakeWordRepo({ id: 'w1', text: 'three' } as Word);
    const svc = new AiSpeechEvaluatorService(provider, wordRepo);

    const result = await svc.evaluate({ file: makeFile(), dto: makeDto({ wordId: 'w1' }) });

    expect(result.score).toBe(88);
    expect(wordRepo.findOne).toHaveBeenCalledWith({ where: { id: 'w1' } });
    expect(calls).toHaveLength(1);
    expect(calls[0].referenceText).toBe('three');
    expect(calls[0].audio.data).toBeInstanceOf(Buffer);
    expect(calls[0].audio.mimeType).toBe('audio/webm');
    expect(calls[0].options.passLine).toBe(60);
  });

  it('referenceText 直传 → 优先使用，不查 Word', async () => {
    const { provider, calls } = makeFakeProvider();
    const wordRepo = makeFakeWordRepo();
    const svc = new AiSpeechEvaluatorService(provider, wordRepo);

    await svc.evaluate({
      file: makeFile(),
      dto: makeDto({ referenceText: 'hello world' }),
    });

    expect(wordRepo.findOne).not.toHaveBeenCalled();
    expect(calls[0].referenceText).toBe('hello world');
  });

  it('缺 audio → NO_AUDIO(400)', async () => {
    const { provider } = makeFakeProvider();
    const svc = new AiSpeechEvaluatorService(provider, makeFakeWordRepo());
    await expect(
      svc.evaluate({ file: undefined as any, dto: makeDto({ wordId: 'w1' }) }),
    ).rejects.toMatchObject({ status: 400, code: 'NO_AUDIO' });
  });

  it('空音频 buffer → NO_AUDIO(400)', async () => {
    const { provider } = makeFakeProvider();
    const svc = new AiSpeechEvaluatorService(provider, makeFakeWordRepo());
    await expect(
      svc.evaluate({
        file: makeFile({ buffer: Buffer.alloc(0) }),
        dto: makeDto({ wordId: 'w1' }),
      }),
    ).rejects.toMatchObject({ status: 400, code: 'NO_AUDIO' });
  });

  it('空文件(size=0) → EMPTY_AUDIO(400)', async () => {
    const { provider } = makeFakeProvider();
    const svc = new AiSpeechEvaluatorService(provider, makeFakeWordRepo());
    await expect(
      svc.evaluate({ file: makeFile({ size: 0 }), dto: makeDto({ wordId: 'w1' }) }),
    ).rejects.toMatchObject({ status: 400, code: 'EMPTY_AUDIO' });
  });

  it('超 5MB → AUDIO_TOO_LARGE(413)', async () => {
    const { provider } = makeFakeProvider();
    const svc = new AiSpeechEvaluatorService(provider, makeFakeWordRepo());
    await expect(
      svc.evaluate({
        file: makeFile({ size: 6 * 1024 * 1024 }),
        dto: makeDto({ wordId: 'w1' }),
      }),
    ).rejects.toMatchObject({ status: 413, code: 'AUDIO_TOO_LARGE' });
  });

  it('不支持的 MIME → UNSUPPORTED_AUDIO_TYPE(415)', async () => {
    const { provider } = makeFakeProvider();
    const svc = new AiSpeechEvaluatorService(provider, makeFakeWordRepo());
    await expect(
      svc.evaluate({
        file: makeFile({ mimetype: 'audio/flac' }),
        dto: makeDto({ wordId: 'w1' }),
      }),
    ).rejects.toMatchObject({ status: 415, code: 'UNSUPPORTED_AUDIO_TYPE' });
  });

  it('durationMs 超 15s → DURATION_EXCEEDED(400)', async () => {
    const { provider } = makeFakeProvider();
    const svc = new AiSpeechEvaluatorService(provider, makeFakeWordRepo());
    await expect(
      svc.evaluate({
        file: makeFile(),
        dto: makeDto({ wordId: 'w1', durationMs: 20000 }),
      }),
    ).rejects.toMatchObject({ status: 400, code: 'DURATION_EXCEEDED' });
  });

  it('wordId 不存在 → WORD_NOT_FOUND(404)', async () => {
    const { provider } = makeFakeProvider();
    const svc = new AiSpeechEvaluatorService(provider, makeFakeWordRepo(null));
    await expect(
      svc.evaluate({ file: makeFile(), dto: makeDto({ wordId: 'missing' }) }),
    ).rejects.toMatchObject({ status: 404, code: 'WORD_NOT_FOUND' });
  });

  it('仅 sentenceId → SENTENCE_SCORING_NOT_READY(400)', async () => {
    const { provider } = makeFakeProvider();
    const svc = new AiSpeechEvaluatorService(provider, makeFakeWordRepo());
    await expect(
      svc.evaluate({ file: makeFile(), dto: makeDto({ sentenceId: 's1' }) }),
    ).rejects.toMatchObject({ status: 400, code: 'SENTENCE_SCORING_NOT_READY' });
  });

  it('wordId/sentenceId/referenceText 全缺 → MISSING_REFERENCE(400)', async () => {
    const { provider } = makeFakeProvider();
    const svc = new AiSpeechEvaluatorService(provider, makeFakeWordRepo());
    await expect(
      svc.evaluate({ file: makeFile(), dto: makeDto() }),
    ).rejects.toMatchObject({ status: 400, code: 'MISSING_REFERENCE' });
  });

  it('校验失败时不调用 provider（短路）', async () => {
    const { provider, calls } = makeFakeProvider();
    const svc = new AiSpeechEvaluatorService(provider, makeFakeWordRepo());
    await expect(
      svc.evaluate({ file: makeFile({ size: 0 }), dto: makeDto({ wordId: 'w1' }) }),
    ).rejects.toBeInstanceOf(SpeechEvaluateError);
    expect(calls).toHaveLength(0);
  });
});
