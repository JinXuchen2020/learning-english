/**
 * 能力 provider 聚合 + 按能力加载配置 单元测试（AI-重构）
 *
 * 覆盖：
 * - 5 个按能力命名的 provider（Chat/Vision/Stt/Tts）各自「有配置→真实 client 委托 /
 *   无配置 / 解析异常 → Mock 安全桩兜底」，绝不抛错；
 * - PronunciationProvider 委托 AiPronunciationScorerService；
 * - AiCapabilityHub 聚合中枢：name 标识 + 五方法分发 + 全 Mock 兜底不抛。
 *
 * 验证「去掉单一兜底链、以能力命名 provider、provider 内加载配置」的重构契约。
 */

import { AiProvider, AudioInput, ImageInput, ScoreResult } from './ai-provider.interface';
import { ProviderConfigService } from './provider-config/provider-config.service';
import { ConfiguredCapabilityProvider } from './configured-capability.provider';
import { ChatProvider } from './chat.provider';
import { VisionProvider } from './vision.provider';
import { SttProvider } from './stt.provider';
import { TtsProvider } from './tts.provider';
import { PronunciationProvider } from './pronunciation.provider';
import { AiPronunciationScorerService } from './ai-pronunciation-scorer.service';
import { AiCapabilityHub } from './ai-capability-hub';

/** 一个确定性的「真实 client」桩：各能力返回非 Mock 标识值，便于断言委托成功。 */
const REAL_CLIENT: AiProvider = {
  name: 'RealClient',
  async chat() {
    return { text: 'REAL_CHAT' };
  },
  async chatWithImage() {
    return { text: 'REAL_VISION' };
  },
  async transcribe() {
    return { text: 'REAL_STT', confidence: 0.9 };
  },
  async assessPronunciation() {
    return { score: 99, readableText: 'x', weakPhonemes: [], feedback: 'f', mascotExpr: 'cheer' };
  },
  async synthesize() {
    return { audioBase64: 'REAL_AUDIO', mimeType: 'audio/mp3' };
  },
};

/** 可配置的假 ProviderConfigService：控制「是否有配置 / 是否抛错」。 */
function makeFakeConfigService(opts: { hasConfig?: boolean; throws?: boolean }): ProviderConfigService {
  return {
    resolveEffectiveParentId: jest.fn(async () => undefined),
    resolveConfigForCapability: jest.fn(async () => {
      if (opts.throws) throw new Error('resolve failed');
      return opts.hasConfig ? ({ id: 'cfg' } as never) : null;
    }),
    buildProvider: jest.fn(() => REAL_CLIENT),
  } as unknown as ProviderConfigService;
}

const AUDIO: AudioInput = { data: Buffer.from('x'), mimeType: 'audio/webm' };
const IMAGE: ImageInput = { data: 'AAA', mimeType: 'image/png' };

describe('ChatProvider (AI-重构)', () => {
  it('有配置 → 委托真实 client.chat', async () => {
    const p = new ChatProvider(makeFakeConfigService({ hasConfig: true }));
    const r = await p.chat([{ role: 'user', content: 'hi' }]);
    expect(r.text).toBe('REAL_CHAT');
  });

  it('无配置 → 回退 Mock 安全桩（不抛错）', async () => {
    const p = new ChatProvider(makeFakeConfigService({ hasConfig: false }));
    const r = await p.chat([{ role: 'user', content: 'hi' }]);
    expect(r.text).toContain('暂时不可用');
  });

  it('配置解析抛错 → 回退 Mock 安全桩（不抛错）', async () => {
    const p = new ChatProvider(makeFakeConfigService({ throws: true }));
    const r = await p.chat([{ role: 'user', content: 'hi' }]);
    expect(r.text).toContain('暂时不可用');
  });
});

describe('VisionProvider (AI-重构)', () => {
  it('有配置 → 委托真实 client.chatWithImage', async () => {
    const p = new VisionProvider(makeFakeConfigService({ hasConfig: true }));
    const r = await p.chatWithImage('desc', IMAGE);
    expect(r.text).toBe('REAL_VISION');
  });

  it('无配置 → 回退 Mock 安全桩', async () => {
    const p = new VisionProvider(makeFakeConfigService({ hasConfig: false }));
    const r = await p.chatWithImage('desc', IMAGE);
    expect(r.text).toContain('暂时无法识别图片内容');
  });
});

describe('SttProvider (AI-重构)', () => {
  it('有配置 → 委托真实 client.transcribe', async () => {
    const p = new SttProvider(makeFakeConfigService({ hasConfig: true }));
    const r = await p.transcribe(AUDIO);
    expect(r.text).toBe('REAL_STT');
  });

  it('无配置 → 回退 Mock 安全桩（空文本，供发音相似度兜底）', async () => {
    const p = new SttProvider(makeFakeConfigService({ hasConfig: false }));
    const r = await p.transcribe(AUDIO);
    expect(r.text).toBe('');
  });
});

describe('TtsProvider (AI-重构)', () => {
  it('有配置 → 委托真实 client.synthesize', async () => {
    const p = new TtsProvider(makeFakeConfigService({ hasConfig: true }));
    const r = await p.synthesize('hello');
    expect(r.audioBase64).toBe('REAL_AUDIO');
  });

  it('无配置 → 回退 Mock 安全桩（空音频，前端 Web Speech 兜底）', async () => {
    const p = new TtsProvider(makeFakeConfigService({ hasConfig: false }));
    const r = await p.synthesize('hello');
    expect(r.audioBase64).toBe('');
  });
});

describe('PronunciationProvider (AI-重构)', () => {
  it('委托 AiPronunciationScorerService.score，透传 audio/referenceText/opts', async () => {
    const score = jest.fn(async () => ({
      score: 77,
      readableText: 'apple',
      weakPhonemes: [],
      feedback: 'fb',
      mascotExpr: 'encourage',
    })) as unknown as AiPronunciationScorerService['score'];
    const scorer = { score } as unknown as AiPronunciationScorerService;
    const p = new PronunciationProvider(scorer);
    const r: ScoreResult = await p.assessPronunciation(AUDIO, 'apple', { passLine: 60 });
    expect(r.score).toBe(77);
    expect(score).toHaveBeenCalledWith({ audio: AUDIO, referenceText: 'apple', opts: { passLine: 60 } });
  });
});

describe('AiCapabilityHub (AI-重构聚合中枢)', () => {
  const chat = new ChatProvider(makeFakeConfigService({ hasConfig: true }));
  const vision = new VisionProvider(makeFakeConfigService({ hasConfig: true }));
  const stt = new SttProvider(makeFakeConfigService({ hasConfig: true }));
  const tts = new TtsProvider(makeFakeConfigService({ hasConfig: true }));
  const score = jest.fn(async () => ({
    score: 77,
    readableText: 'apple',
    weakPhonemes: [],
    feedback: 'fb',
    mascotExpr: 'encourage',
  })) as unknown as AiPronunciationScorerService['score'];
  const pronunciation = new PronunciationProvider({ score } as unknown as AiPronunciationScorerService);

  const hub = new AiCapabilityHub(chat, vision, stt, tts, pronunciation);

  it('name 标识为 AiCapabilityHub', () => {
    expect(hub.name).toBe('AiCapabilityHub');
  });

  it('chat → ChatProvider 委托', async () => {
    const r = await hub.chat([{ role: 'user', content: 'hi' }]);
    expect(r.text).toBe('REAL_CHAT');
  });

  it('chatWithImage → VisionProvider 委托', async () => {
    const r = await hub.chatWithImage('desc', IMAGE);
    expect(r.text).toBe('REAL_VISION');
  });

  it('transcribe → SttProvider 委托', async () => {
    const r = await hub.transcribe(AUDIO);
    expect(r.text).toBe('REAL_STT');
  });

  it('synthesize → TtsProvider 委托', async () => {
    const r = await hub.synthesize('hello');
    expect(r.audioBase64).toBe('REAL_AUDIO');
  });

  it('assessPronunciation → PronunciationProvider 委托', async () => {
    const r = await hub.assessPronunciation(AUDIO, 'apple');
    expect(r.score).toBe(77);
  });
});

describe('AiCapabilityHub 全 Mock 兜底（无任何配置也不抛错）', () => {
  const noConfig = makeFakeConfigService({ hasConfig: false });
  const hub = new AiCapabilityHub(
    new ChatProvider(noConfig),
    new VisionProvider(noConfig),
    new SttProvider(noConfig),
    new TtsProvider(noConfig),
    new PronunciationProvider({
      score: jest.fn(async () => ({
        score: 0,
        readableText: 'apple',
        weakPhonemes: [],
        feedback: 'x',
        mascotExpr: 'encourage',
      })),
    } as unknown as AiPronunciationScorerService),
  );

  it('chat 回退 Mock 文案', async () => {
    const r = await hub.chat([{ role: 'user', content: 'hi' }]);
    expect(r.text).toContain('暂时不可用');
  });

  it('transcribe 回退空文本', async () => {
    const r = await hub.transcribe(AUDIO);
    expect(r.text).toBe('');
  });

  it('synthesize 回退空音频', async () => {
    const r = await hub.synthesize('hello');
    expect(r.audioBase64).toBe('');
  });
});
