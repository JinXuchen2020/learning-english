import {
  ANONYMOUS_USER_PLACEHOLDER,
  buildAttemptEntry,
  buildSpeechFeedback,
  INLINE_AUDIO_PLACEHOLDER,
  levelFromScore,
  PASS_LINE,
  SpeechFeedback,
} from './speech-feedback.util';
import { ScoreResult } from './ai-provider.interface';
import { EvaluateSpeechDto } from './speech-evaluate.dto';

/** 构造一个最小合法 ScoreResult。 */
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

/** 构造最小 DTO。 */
function makeDto(over: Partial<EvaluateSpeechDto> = {}): EvaluateSpeechDto {
  return { wordId: 'w1', ...over } as EvaluateSpeechDto;
}

describe('speech-feedback.util (AI-306)', () => {
  describe('levelFromScore', () => {
    it('score < 60 → weak', () => {
      expect(levelFromScore(0)).toBe('weak');
      expect(levelFromScore(59)).toBe('weak');
    });
    it('60 ≤ score < 80 → ok（边界含 60）', () => {
      expect(levelFromScore(60)).toBe('ok');
      expect(levelFromScore(79)).toBe('ok');
    });
    it('score ≥ 80 → good（边界含 80）', () => {
      expect(levelFromScore(80)).toBe('good');
      expect(levelFromScore(100)).toBe('good');
    });
  });

  describe('buildSpeechFeedback', () => {
    it('passed = score >= PASS_LINE（边界 60→true, 59→false）', () => {
      const pass: SpeechFeedback = buildSpeechFeedback(makeResult({ score: PASS_LINE }));
      const fail: SpeechFeedback = buildSpeechFeedback(makeResult({ score: PASS_LINE - 1 }));
      expect(pass.passed).toBe(true);
      expect(fail.passed).toBe(false);
    });

    it('level 跟随 score 档位', () => {
      expect(buildSpeechFeedback(makeResult({ score: 90 })).level).toBe('good');
      expect(buildSpeechFeedback(makeResult({ score: 70 })).level).toBe('ok');
      expect(buildSpeechFeedback(makeResult({ score: 30 })).level).toBe('weak');
    });

    it('mascotExpr 优先取 ScoreResult 的值', () => {
      const fb = buildSpeechFeedback(makeResult({ score: 30, mascotExpr: 'thinking' }));
      expect(fb.mascotExpr).toBe('thinking');
    });

    it('mascotExpr 缺失时按分数推断（低分 → thinking）', () => {
      const fb = buildSpeechFeedback(makeResult({ score: 30, mascotExpr: undefined as any }));
      expect(fb.mascotExpr).toBe('thinking');
    });

    it('透传 score/readableText/weakPhonemes/feedback', () => {
      const r = makeResult({ score: 77, readableText: 'banana', weakPhonemes: ['v'], feedback: '不错' });
      const fb = buildSpeechFeedback(r);
      expect(fb.score).toBe(77);
      expect(fb.readableText).toBe('banana');
      expect(fb.weakPhonemes).toEqual(['v']);
      expect(fb.feedback).toBe('不错');
    });
  });

  describe('buildAttemptEntry', () => {
    it('userId 未提供 → anonymous 占位', () => {
      const e = buildAttemptEntry(undefined, makeDto(), makeResult());
      expect(e.userId).toBe(ANONYMOUS_USER_PLACEHOLDER);
    });

    it('userId 空白 → anonymous 占位；非空则 trim 透传', () => {
      expect(buildAttemptEntry('   ', makeDto(), makeResult()).userId).toBe(
        ANONYMOUS_USER_PLACEHOLDER,
      );
      expect(buildAttemptEntry('  kid-9  ', makeDto(), makeResult()).userId).toBe('kid-9');
    });

    it('audioPath 未提供 → <inline> 占位', () => {
      const e = buildAttemptEntry('kid', makeDto(), makeResult());
      expect(e.audioPath).toBe(INLINE_AUDIO_PLACEHOLDER);
    });

    it('audioPath 非空则 trim 透传', () => {
      const e = buildAttemptEntry('kid', makeDto({ audioPath: '  /uploads/a.webm  ' }), makeResult());
      expect(e.audioPath).toBe('/uploads/a.webm');
    });

    it('wordId/sentenceId 透传（二选一），score/weakPhonemes 透传', () => {
      const e = buildAttemptEntry(
        'kid',
        makeDto({ wordId: 'w9', sentenceId: undefined }),
        makeResult({ score: 42, weakPhonemes: ['θ', 'ʃ'] }),
      );
      expect(e.wordId).toBe('w9');
      expect(e.sentenceId).toBeNull();
      expect(e.score).toBe(42);
      expect(e.weakPhonemes).toEqual(['θ', 'ʃ']);
    });

    it('sentenceId 模式：wordId 为 null', () => {
      const e = buildAttemptEntry('kid', makeDto({ wordId: undefined, sentenceId: 's3' }), makeResult());
      expect(e.wordId).toBeNull();
      expect(e.sentenceId).toBe('s3');
    });
  });
});
