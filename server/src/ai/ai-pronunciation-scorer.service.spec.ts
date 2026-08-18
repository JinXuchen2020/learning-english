/**
 * AiPronunciationScorerService 单元测试（AI-305，AI-重构后）
 *
 * 新实现：构造函数注入 `ChatProvider` + `AiTranscribeService`，统一走
 * 「转写(SttProvider) → 编辑距离相似度 → LLM 评估(ChatProvider) → 综合」兜底，
 * 不再区分 phoneme / azure 分支（本项目无 phoneme 级 provider）。
 * 覆盖：clientTranscript 跳过 STT / 精确匹配高分 / 空转写降级 / chat JSON 解析 /
 * chat 抛错回退 / 入参透传 / passLine 判定 degraded。
 */

import { AudioInput } from './ai-provider.interface';
import { ChatProvider } from './chat.provider';
import { AiTranscribeService, TranscriptOutcome } from './ai-transcribe.service';
import { AiPronunciationScorerService } from './ai-pronunciation-scorer.service';

/** 可配置的假 ChatProvider（仅 scorer 用到的 chat 方法）。 */
function makeFakeChat(opts: { chatText?: string; chatThrows?: boolean }): ChatProvider {
  return {
    name: 'FakeChat',
    async chat() {
      if (opts.chatThrows) throw new Error('chat failed');
      return {
        text: opts.chatText ?? '{"feedback":"不错","weakPhonemes":["θ"],"mascotExpr":"encourage"}',
      };
    },
  } as unknown as ChatProvider;
}

/** 可配置的假转写服务。 */
function makeFakeTranscriber(opts: {
  text?: string;
  degraded?: boolean;
  throws?: boolean;
  capture?: (audio: AudioInput) => void;
}): AiTranscribeService {
  return {
    async transcribe(audio: AudioInput): Promise<TranscriptOutcome> {
      if (opts.throws) throw new Error('transcribe failed');
      opts.capture?.(audio);
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

describe('AiPronunciationScorerService (AI-305, AI-重构)', () => {
  it('clientTranscript 已提供 → 跳过 STT，直接相似度评分', async () => {
    let transcribeCalled = false;
    const transcriber = makeFakeTranscriber({
      text: 'apple',
      capture: () => {
        transcribeCalled = true;
      },
    });
    const scorer = new AiPronunciationScorerService(makeFakeChat({}), transcriber);
    const r = await scorer.score({ audio: AUDIO, referenceText: 'apple', clientTranscript: 'apple' });
    expect(transcribeCalled).toBe(false);
    expect(r.strategy).toBe('similarity');
    expect(r.score).toBe(100);
    expect(r.degraded).toBe(false);
  });

  it('无 clientTranscript → 调用 STT，精确匹配得满分', async () => {
    const transcriber = makeFakeTranscriber({ text: 'i see a red apple' });
    const scorer = new AiPronunciationScorerService(makeFakeChat({}), transcriber);
    const r = await scorer.score({ audio: AUDIO, referenceText: 'i see a red apple' });
    expect(r.strategy).toBe('similarity');
    expect(r.score).toBe(100);
    expect(r.degraded).toBe(false);
  });

  it('STT 降级（空文本）→ 相似度 0 → 低分 + degraded + 友好反馈', async () => {
    const transcriber = makeFakeTranscriber({ text: '', degraded: true });
    const scorer = new AiPronunciationScorerService(
      makeFakeChat({ chatText: '{"feedback":"没听清，再试一次","weakPhonemes":["θ"]}' }),
      transcriber,
    );
    const r = await scorer.score({ audio: AUDIO, referenceText: 'apple' });
    expect(r.score).toBe(0);
    expect(r.degraded).toBe(true);
    expect(r.feedback).toContain('没听清');
  });

  it('chat 返回合法 JSON → 解析 weakPhonemes / mascotExpr / feedback', async () => {
    const transcriber = makeFakeTranscriber({ text: 'apple' });
    const scorer = new AiPronunciationScorerService(
      makeFakeChat({
        chatText: '{"feedback":"很接近！","weakPhonemes":["θ","v"],"mascotExpr":"encourage"}',
      }),
      transcriber,
    );
    const r = await scorer.score({ audio: AUDIO, referenceText: 'apple' });
    expect(r.feedback).toBe('很接近！');
    expect(r.weakPhonemes).toEqual(['θ', 'v']);
    expect(r.mascotExpr).toBe('encourage');
  });

  it('chat 抛错 → 走相似度兜底反馈，不抛异常', async () => {
    const transcriber = makeFakeTranscriber({ text: 'apple' });
    const scorer = new AiPronunciationScorerService(makeFakeChat({ chatThrows: true }), transcriber);
    const r = await scorer.score({ audio: AUDIO, referenceText: 'apple' });
    expect(r.strategy).toBe('similarity');
    expect(r.feedback).toContain('apple'); // 兜底文案含参考文本
  });

  it('audio + referenceText 透传给 STT', async () => {
    let captured: AudioInput | undefined;
    const transcriber = makeFakeTranscriber({
      text: 'apple',
      capture: (a) => {
        captured = a;
      },
    });
    const scorer = new AiPronunciationScorerService(makeFakeChat({}), transcriber);
    await scorer.score({ audio: AUDIO, referenceText: 'banana' });
    expect(captured).toBe(AUDIO);
  });

  it('score 低于 passLine → 标记为 degraded（即便 STT 未降级）', async () => {
    // 参考文本与转写完全不同 → 相似度低 → 分数低于 passLine。
    const transcriber = makeFakeTranscriber({ text: 'completely different words here' });
    const scorer = new AiPronunciationScorerService(makeFakeChat({}), transcriber);
    const r = await scorer.score({ audio: AUDIO, referenceText: 'banana', opts: { passLine: 90 } });
    expect(r.score).toBeLessThan(90);
    expect(r.degraded).toBe(true);
  });
});
