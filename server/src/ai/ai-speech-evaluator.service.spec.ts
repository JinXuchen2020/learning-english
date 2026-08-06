/**
 * AiSpeechEvaluatorService 单元测试（AI-303 / AI-305 / AI-306）
 * evaluator 现：校验 → 参考文本解析 → 委托 AiPronunciationScorerService（AI-305）
 * 统一评分 → 委托 AiSpeechFeedbackService（AI-306）装配反馈 + best-effort 落库。
 * 本 spec 用 fake scorer + fake feedback 验证编排，不触发真实 AI 链（隔离）。
 */

import { AiSpeechEvaluatorService, UploadedAudioFile } from './ai-speech-evaluator.service';
import { SpeechEvaluateError } from './speech-evaluate.validation';
import { EvaluateSpeechDto } from './speech-evaluate.dto';
import { ScoreResult } from './ai-provider.interface';
import { Repository } from 'typeorm';
import { Word } from '../entities/word.entity';
import { AiPronunciationScorerService } from './ai-pronunciation-scorer.service';
import { AiSpeechFeedbackService } from './ai-speech-feedback.service';

/** 假评分服务：记录 score 入参并返回确定性 ScoredResult。 */
function makeFakeScorer() {
  const calls: any[] = [];
  const scorer = {
    score: jest.fn(async (input: { audio: any; referenceText: string; opts?: any }) => {
      calls.push(input);
      const result: ScoreResult & { strategy: string } = {
        score: 88,
        readableText: input.referenceText,
        weakPhonemes: ['θ', 'v'],
        feedback: '[Mock] 很接近啦！',
        mascotExpr: 'encourage',
        strategy: 'phoneme',
      };
      return result;
    }),
  };
  return { scorer: scorer as unknown as AiPronunciationScorerService, calls };
}

/** 假反馈服务：记录 feedback 入参并返回确定性 SpeechFeedback。 */
function makeFakeFeedback() {
  const calls: any[] = [];
  const feedback = {
    feedback: jest.fn(async (input: { userId?: string; dto: any; result: ScoreResult }) => {
      calls.push(input);
      return {
        ...input.result,
        passed: input.result.score >= 60,
        level: input.result.score >= 80 ? 'good' : input.result.score >= 60 ? 'ok' : 'weak',
        mascotExpr: input.result.mascotExpr || 'encourage',
      };
    }),
  };
  return { feedback: feedback as unknown as AiSpeechFeedbackService, calls };
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
  it('合法 wordId → 解析 Word.text 作参考文本并委托 scorer，返回 SpeechFeedback', async () => {
    const { scorer, calls } = makeFakeScorer();
    const feedback = makeFakeFeedback();
    const wordRepo = makeFakeWordRepo({ id: 'w1', text: 'three' } as Word);
    const svc = new AiSpeechEvaluatorService(wordRepo, scorer, feedback.feedback);

    const result = await svc.evaluate({ file: makeFile(), dto: makeDto({ wordId: 'w1' }) });

    expect(result.score).toBe(88);
    expect(result.passed).toBe(true);
    expect(result.level).toBe('good');
    expect(wordRepo.findOne).toHaveBeenCalledWith({ where: { id: 'w1' } });
    expect(calls).toHaveLength(1);
    expect(calls[0].referenceText).toBe('three');
    expect(calls[0].audio.data).toBeInstanceOf(Buffer);
    expect(calls[0].audio.mimeType).toBe('audio/webm');
    expect(calls[0].opts.passLine).toBe(60);
    // 委托 feedback：入参含 userId(未提供→undefined) + dto + result(score=88)
    expect(feedback.calls).toHaveLength(1);
    expect(feedback.calls[0].userId).toBeUndefined();
    expect(feedback.calls[0].result.score).toBe(88);
  });

  it('referenceText 直传 → 优先使用，不查 Word', async () => {
    const { scorer, calls } = makeFakeScorer();
    const feedback = makeFakeFeedback();
    const wordRepo = makeFakeWordRepo();
    const svc = new AiSpeechEvaluatorService(wordRepo, scorer, feedback.feedback);

    await svc.evaluate({ file: makeFile(), dto: makeDto({ referenceText: 'hello world' }) });

    expect(wordRepo.findOne).not.toHaveBeenCalled();
    expect(calls[0].referenceText).toBe('hello world');
  });

  it('dto.userId 透传给 feedback（落库归属）', async () => {
    const { scorer } = makeFakeScorer();
    const feedback = makeFakeFeedback();
    const svc = new AiSpeechEvaluatorService(makeFakeWordRepo(), scorer, feedback.feedback);

    await svc.evaluate({ file: makeFile(), dto: makeDto({ referenceText: 'hi', userId: 'kid-7' }) });

    expect(feedback.calls[0].userId).toBe('kid-7');
  });

  it('缺 audio → NO_AUDIO(400)', async () => {
    const { scorer } = makeFakeScorer();
    const feedback = makeFakeFeedback();
    const svc = new AiSpeechEvaluatorService(makeFakeWordRepo(), scorer, feedback.feedback);
    await expect(
      svc.evaluate({ file: undefined as any, dto: makeDto({ wordId: 'w1' }) }),
    ).rejects.toMatchObject({ status: 400, code: 'NO_AUDIO' });
  });

  it('空音频 buffer → NO_AUDIO(400)', async () => {
    const { scorer } = makeFakeScorer();
    const feedback = makeFakeFeedback();
    const svc = new AiSpeechEvaluatorService(makeFakeWordRepo(), scorer, feedback.feedback);
    await expect(
      svc.evaluate({ file: makeFile({ buffer: Buffer.alloc(0) }), dto: makeDto({ wordId: 'w1' }) }),
    ).rejects.toMatchObject({ status: 400, code: 'NO_AUDIO' });
  });

  it('空文件(size=0) → EMPTY_AUDIO(400)', async () => {
    const { scorer } = makeFakeScorer();
    const feedback = makeFakeFeedback();
    const svc = new AiSpeechEvaluatorService(makeFakeWordRepo(), scorer, feedback.feedback);
    await expect(
      svc.evaluate({ file: makeFile({ size: 0 }), dto: makeDto({ wordId: 'w1' }) }),
    ).rejects.toMatchObject({ status: 400, code: 'EMPTY_AUDIO' });
  });

  it('超 5MB → AUDIO_TOO_LARGE(413)', async () => {
    const { scorer } = makeFakeScorer();
    const feedback = makeFakeFeedback();
    const svc = new AiSpeechEvaluatorService(makeFakeWordRepo(), scorer, feedback.feedback);
    await expect(
      svc.evaluate({ file: makeFile({ size: 6 * 1024 * 1024 }), dto: makeDto({ wordId: 'w1' }) }),
    ).rejects.toMatchObject({ status: 413, code: 'AUDIO_TOO_LARGE' });
  });

  it('不支持的 MIME → UNSUPPORTED_AUDIO_TYPE(415)', async () => {
    const { scorer } = makeFakeScorer();
    const feedback = makeFakeFeedback();
    const svc = new AiSpeechEvaluatorService(makeFakeWordRepo(), scorer, feedback.feedback);
    await expect(
      svc.evaluate({ file: makeFile({ mimetype: 'audio/flac' }), dto: makeDto({ wordId: 'w1' }) }),
    ).rejects.toMatchObject({ status: 415, code: 'UNSUPPORTED_AUDIO_TYPE' });
  });

  it('durationMs 超 15s → DURATION_EXCEEDED(400)', async () => {
    const { scorer } = makeFakeScorer();
    const feedback = makeFakeFeedback();
    const svc = new AiSpeechEvaluatorService(makeFakeWordRepo(), scorer, feedback.feedback);
    await expect(
      svc.evaluate({ file: makeFile(), dto: makeDto({ wordId: 'w1', durationMs: 20000 }) }),
    ).rejects.toMatchObject({ status: 400, code: 'DURATION_EXCEEDED' });
  });

  it('wordId 不存在 → WORD_NOT_FOUND(404)', async () => {
    const { scorer } = makeFakeScorer();
    const feedback = makeFakeFeedback();
    const svc = new AiSpeechEvaluatorService(makeFakeWordRepo(null), scorer, feedback.feedback);
    await expect(
      svc.evaluate({ file: makeFile(), dto: makeDto({ wordId: 'missing' }) }),
    ).rejects.toMatchObject({ status: 404, code: 'WORD_NOT_FOUND' });
  });

  it('仅 sentenceId → SENTENCE_SCORING_NOT_READY(400)', async () => {
    const { scorer } = makeFakeScorer();
    const feedback = makeFakeFeedback();
    const svc = new AiSpeechEvaluatorService(makeFakeWordRepo(), scorer, feedback.feedback);
    await expect(
      svc.evaluate({ file: makeFile(), dto: makeDto({ sentenceId: 's1' }) }),
    ).rejects.toMatchObject({ status: 400, code: 'SENTENCE_SCORING_NOT_READY' });
  });

  it('wordId/sentenceId/referenceText 全缺 → MISSING_REFERENCE(400)', async () => {
    const { scorer } = makeFakeScorer();
    const feedback = makeFakeFeedback();
    const svc = new AiSpeechEvaluatorService(makeFakeWordRepo(), scorer, feedback.feedback);
    await expect(
      svc.evaluate({ file: makeFile(), dto: makeDto() }),
    ).rejects.toMatchObject({ status: 400, code: 'MISSING_REFERENCE' });
  });

  it('校验失败时不调用 scorer / feedback（短路）', async () => {
    const { scorer, calls } = makeFakeScorer();
    const feedback = makeFakeFeedback();
    const svc = new AiSpeechEvaluatorService(makeFakeWordRepo(), scorer, feedback.feedback);
    await expect(
      svc.evaluate({ file: makeFile({ size: 0 }), dto: makeDto({ wordId: 'w1' }) }),
    ).rejects.toBeInstanceOf(SpeechEvaluateError);
    expect(calls).toHaveLength(0);
    expect(feedback.calls).toHaveLength(0);
  });
});
