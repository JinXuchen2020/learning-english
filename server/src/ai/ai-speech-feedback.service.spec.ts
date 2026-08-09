import { AiSpeechFeedbackService } from './ai-speech-feedback.service';
import { AiSpeechAttemptService } from './ai-speech-attempt.service';
import { RewardsService } from '../rewards/rewards.service';
import { ScoreResult } from './ai-provider.interface';
import { EvaluateSpeechDto } from './speech-evaluate.dto';

/** 假 AiSpeechAttemptService：record 行为可由测试注入。 */
function makeFakeAttempts(opts: { recordImpl?: (e: any) => Promise<boolean> } = {}) {
  return {
    record: jest.fn(opts.recordImpl ?? (async () => true)),
  } as unknown as AiSpeechAttemptService;
}

/** 假 RewardsService：awardStars 为 no-op（本 spec 不校验积分累加）。 */
function makeFakeRewards() {
  return {
    awardStars: jest.fn(async () => undefined),
  } as unknown as RewardsService;
}

function makeResult(over: Partial<ScoreResult> = {}): ScoreResult {
  return {
    score: 88,
    readableText: 'apple',
    weakPhonemes: ['θ'],
    feedback: '很棒！',
    mascotExpr: 'happy',
    ...over,
  };
}

function makeDto(over: Partial<EvaluateSpeechDto> = {}): EvaluateSpeechDto {
  return { wordId: 'w1', ...over } as EvaluateSpeechDto;
}

describe('AiSpeechFeedbackService (AI-306)', () => {
  it('落库成功 → record 被调用一次且返回 SpeechFeedback（passed/level 正确）', async () => {
    const attempts = makeFakeAttempts();
    const svc = new AiSpeechFeedbackService(attempts, makeFakeRewards());
    const result = makeResult({ score: 88 });

    const fb = await svc.feedback({ userId: 'kid', dto: makeDto(), result });

    expect(attempts.record).toHaveBeenCalledTimes(1);
    // 入参 entry 含 userId + 透传 score/weakPhonemes + audioPath 占位
    const entry = (attempts.record as jest.Mock).mock.calls[0][0];
    expect(entry.userId).toBe('kid');
    expect(entry.score).toBe(88);
    expect(entry.weakPhonemes).toEqual(['θ']);
    expect(entry.audioPath).toBe('<inline>');
    // 返回结构
    expect(fb.passed).toBe(true);
    expect(fb.level).toBe('good');
    expect(fb.mascotExpr).toBe('happy');
    expect(fb.score).toBe(88);
  });

  it('落库抛错 → best-effort 不抛 + 仍返回 SpeechFeedback（不阻断反馈）', async () => {
    const attempts = makeFakeAttempts({
      recordImpl: async () => {
        throw new Error('db down');
      },
    });
    const svc = new AiSpeechFeedbackService(attempts, makeFakeRewards());
    const result = makeResult({ score: 30, mascotExpr: undefined as any });

    // 不应抛
    const fb = await svc.feedback({ userId: 'kid', dto: makeDto(), result });

    expect(attempts.record).toHaveBeenCalledTimes(1);
    expect(fb.passed).toBe(false);
    expect(fb.level).toBe('weak');
    expect(fb.mascotExpr).toBe('thinking'); // 低分推断
    expect(fb.score).toBe(30);
  });

  it('未提供 userId → 落库用 anonymous 占位', async () => {
    const attempts = makeFakeAttempts();
    const svc = new AiSpeechFeedbackService(attempts, makeFakeRewards());
    await svc.feedback({ dto: makeDto(), result: makeResult() });
    const entry = (attempts.record as jest.Mock).mock.calls[0][0];
    expect(entry.userId).toBe('anonymous');
  });
});
