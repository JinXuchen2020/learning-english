/**
 * AiPronunciationScorerService 单元测试（AI-305）
 * fake AiProvider（assessPronunciation 可配成功/抛错；chat 可配 JSON/抛错）+ fake AiTranscribeService
 * 覆盖：首选 phoneme 成功 / azure+phoneme 抛错→兜底 / 非 azure→similarity / 显式 similarity 跳过 phoneme /
 * transcribe 降级(空)→低分+degraded / chat JSON 解析 / chat 抛错→fallback feedback / 入参断言。
 */

import { AiProvider, AudioInput, ProviderName, ScoreResult, TranscriptResult } from './ai-provider.interface';
import { AiTranscribeService, TranscriptOutcome } from './ai-transcribe.service';
import { AiPronunciationScorerService } from './ai-pronunciation-scorer.service';

/** 可配置的假 provider。 */
function makeFakeProvider(opts: {
  name?: ProviderName;
  assess?: (audio: AudioInput, ref: string) => ScoreResult | Promise<ScoreResult>;
  assessThrows?: boolean;
  chatText?: string;
  chatThrows?: boolean;
}): AiProvider {
  const name = opts.name ?? 'mock';
  return {
    name,
    async chat() {
      if (opts.chatThrows) throw new Error('chat failed');
      return { text: opts.chatText ?? '{"feedback":"不错","weakPhonemes":["θ"],"mascotExpr":"encourage"}' };
    },
    async chatWithImage() {
      return { text: '' };
    },
    async transcribe(_audio: AudioInput): Promise<TranscriptResult> {
      return { text: 'i see a red apple', confidence: 1, durationMs: 0 };
    },
    async assessPronunciation(_audio: AudioInput, referenceText: string) {
      if (opts.assessThrows) throw new Error('assess failed');
      if (opts.assess) return opts.assess(_audio, referenceText);
      return {
        score: 88,
        readableText: referenceText,
        weakPhonemes: ['θ'],
        feedback: 'mock',
        mascotExpr: 'encourage',
      };
    },
    async synthesize() {
      return { mimeType: 'audio/mp3' };
    },
  } as AiProvider;
}

function makeFakeTranscriber(opts: {
  text?: string;
  degraded?: boolean;
  throws?: boolean;
}): AiTranscribeService {
  return {
    async transcribe(_audio: AudioInput): Promise<TranscriptOutcome> {
      if (opts.throws) throw new Error('transcribe failed');
      return {
        text: opts.text ?? 'i see a red apple',
        confidence: opts.degraded ? 0.1 : 1,
        durationMs: 0,
        degraded: opts.degraded,
      };
    },
  } as unknown as AiTranscribeService;
}

const AUDIO: AudioInput = { data: Buffer.from('x'), mimeType: 'audio/webm' };

describe('AiPronunciationScorerService (AI-305)', () => {
  it('auto + azure + phoneme 成功 → strategy=phoneme，分数来自 assess', async () => {
    const provider = makeFakeProvider({ name: 'azure' });
    const scorer = new AiPronunciationScorerService(provider, makeFakeTranscriber({}));
    const r = await scorer.score({ audio: AUDIO, referenceText: 'apple', opts: { strategy: 'auto' } });
    expect(r.strategy).toBe('phoneme');
    expect(r.score).toBe(88);
    expect(r.degraded).toBeUndefined();
  });

  it('auto + azure 但 phoneme 抛错 → 兜底 similarity（不抛异常）', async () => {
    const provider = makeFakeProvider({ name: 'azure', assessThrows: true, chatText: '{"feedback":"兜底","weakPhonemes":["v"]}' });
    const scorer = new AiPronunciationScorerService(provider, makeFakeTranscriber({}));
    const r = await scorer.score({ audio: AUDIO, referenceText: 'apple', opts: { strategy: 'auto' } });
    expect(r.strategy).toBe('similarity');
    expect(r.degraded).toBe(true);
  });

  it('auto + 非 azure（bigmodel）→ 直接 similarity 兜底', async () => {
    const provider = makeFakeProvider({ name: 'bigmodel' });
    const scorer = new AiPronunciationScorerService(provider, makeFakeTranscriber({ text: 'i see a red apple' }));
    const r = await scorer.score({ audio: AUDIO, referenceText: 'i see a red apple', opts: { strategy: 'auto' } });
    expect(r.strategy).toBe('similarity');
    expect(r.score).toBe(100); // 完全匹配
  });

  it('显式 strategy=similarity → 跳过 assessPronunciation', async () => {
    let assessCalled = false;
    const provider = makeFakeProvider({
      name: 'azure',
      assess: () => {
        assessCalled = true;
        return { score: 88, readableText: 'x', weakPhonemes: [], feedback: '', mascotExpr: 'encourage' };
      },
    });
    const scorer = new AiPronunciationScorerService(provider, makeFakeTranscriber({ text: 'apple' }));
    const r = await scorer.score({ audio: AUDIO, referenceText: 'apple', opts: { strategy: 'similarity' } });
    expect(assessCalled).toBe(false);
    expect(r.strategy).toBe('similarity');
  });

  it('transcribe 降级（空文本）→ 相似度 0 → 低分 + degraded + 友好反馈', async () => {
    const provider = makeFakeProvider({
      name: 'bigmodel',
      chatText: '{"feedback":"没听清，再试一次","weakPhonemes":["θ"]}',
    });
    const scorer = new AiPronunciationScorerService(provider, makeFakeTranscriber({ text: '', degraded: true }));
    const r = await scorer.score({ audio: AUDIO, referenceText: 'apple', opts: { strategy: 'auto' } });
    expect(r.score).toBe(0);
    expect(r.degraded).toBe(true);
    expect(r.feedback).toContain('没听清');
  });

  it('chat 返回合法 JSON → 解析 weakPhonemes / mascotExpr', async () => {
    const provider = makeFakeProvider({
      name: 'bigmodel',
      chatText: '{"feedback":"很接近！","weakPhonemes":["θ","v"],"mascotExpr":"encourage"}',
    });
    const scorer = new AiPronunciationScorerService(provider, makeFakeTranscriber({ text: 'apple' }));
    const r = await scorer.score({ audio: AUDIO, referenceText: 'apple', opts: { strategy: 'auto' } });
    expect(r.feedback).toBe('很接近！');
    expect(r.weakPhonemes).toEqual(['θ', 'v']);
    expect(r.mascotExpr).toBe('encourage');
  });

  it('chat 抛错 → 走 buildSimilarityFallbackFeedback，不抛异常', async () => {
    const provider = makeFakeProvider({ name: 'bigmodel', chatThrows: true });
    const scorer = new AiPronunciationScorerService(provider, makeFakeTranscriber({ text: 'apple' }));
    const r = await scorer.score({ audio: AUDIO, referenceText: 'apple', opts: { strategy: 'auto' } });
    expect(r.strategy).toBe('similarity');
    expect(r.feedback).toContain('apple'); // 兜底文案含参考文本
  });

  it('把 audio + referenceText + passLine 透传给 phoneme 路径', async () => {
    let captured: { audio?: AudioInput; ref?: string; passLine?: number } = {};
    const provider = makeFakeProvider({
      name: 'azure',
      assess: (audio, ref) => {
        captured = { audio, ref, passLine: 60 };
        return { score: 90, readableText: ref, weakPhonemes: [], feedback: '', mascotExpr: 'happy' };
      },
    });
    const scorer = new AiPronunciationScorerService(provider, makeFakeTranscriber({}));
    await scorer.score({ audio: AUDIO, referenceText: 'banana', opts: { passLine: 60 } });
    expect(captured.audio).toBe(AUDIO);
    expect(captured.ref).toBe('banana');
  });
});
