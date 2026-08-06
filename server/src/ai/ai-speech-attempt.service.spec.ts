import { AiSpeechAttemptService } from './ai-speech-attempt.service';
import {
  AiSpeechAttempt,
  AiSpeechAttemptEntry,
  clampScore,
  sanitizePhonemes,
} from './ai-speech-attempt.entity';
import { logger } from '../common/logger/logger';

/** 假 TypeORM 仓库：create 原样返回、save/find 成功回显。 */
const fakeRepo: any = {
  create: jest.fn((e: Partial<AiSpeechAttempt>) => e as AiSpeechAttempt),
  save: jest.fn(async (e: AiSpeechAttempt) => e),
  find: jest.fn(async () => [] as AiSpeechAttempt[]),
};

function makeEntry(overrides: Partial<AiSpeechAttemptEntry> = {}): AiSpeechAttemptEntry {
  return {
    userId: 'u1',
    audioPath: '/audio/rec.webm',
    score: 80,
    ...overrides,
  };
}

describe('clampScore', () => {
  it('NaN / Infinity / undefined → 0', () => {
    expect(clampScore(NaN)).toBe(0);
    expect(clampScore(Infinity)).toBe(0);
    expect(clampScore(-Infinity)).toBe(0);
    expect(clampScore(undefined as unknown as number)).toBe(0);
  });
  it('负数 → 0', () => expect(clampScore(-5)).toBe(0));
  it('超过 100 → 100', () => expect(clampScore(150)).toBe(100));
  it('小数四舍五入', () => {
    expect(clampScore(50.4)).toBe(50);
    expect(clampScore(50.6)).toBe(51);
  });
  it('合法区间内取整', () => expect(clampScore(73.2)).toBe(73));
});

describe('sanitizePhonemes', () => {
  it('null / undefined → 空数组', () => {
    expect(sanitizePhonemes(null)).toEqual([]);
    expect(sanitizePhonemes(undefined)).toEqual([]);
  });
  it('空数组 → 空数组', () => expect(sanitizePhonemes([])).toEqual([]));
  it('trim 首尾空白并过滤空串', () => {
    expect(sanitizePhonemes([' θ ', '', '   ', 'ʃ'])).toEqual(['θ', 'ʃ']);
  });
});

describe('AiSpeechAttemptService', () => {
  let service: AiSpeechAttemptService;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiSpeechAttemptService(fakeRepo);
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterAll(() => warnSpy.mockRestore());

  it('record 成功返回 true，字段透传 + score 钳制 + weakPhonemes 清洗', async () => {
    const res = await service.record(
      makeEntry({ score: 87.6, weakPhonemes: [' θ ', ''] }),
    );
    expect(res).toBe(true);
    expect(fakeRepo.save).toHaveBeenCalledTimes(1);
    const row = fakeRepo.save.mock.calls[0][0] as AiSpeechAttempt;
    expect(row.userId).toBe('u1');
    expect(row.audioPath).toBe('/audio/rec.webm');
    expect(row.score).toBe(88); // 87.6 → 88 四舍五入
    expect(row.weakPhonemes).toEqual(['θ']); // 清洗后仅留 'θ'
    expect(row.wordId).toBeNull();
    expect(row.sentenceId).toBeNull();
  });

  it('record 越界 score 被钳制到 [0,100]', async () => {
    await service.record(makeEntry({ score: 200 }));
    expect((fakeRepo.save.mock.calls[0][0] as AiSpeechAttempt).score).toBe(100);
    await service.record(makeEntry({ score: -10 }));
    expect((fakeRepo.save.mock.calls[1][0] as AiSpeechAttempt).score).toBe(0);
  });

  it('DB 写入失败时 record 返回 false 且不抛，warn 被调用', async () => {
    fakeRepo.save.mockRejectedValueOnce(new Error('disk full'));
    const res = await service.record(makeEntry());
    expect(res).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('口语尝试落库失败'),
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('findByUser 调 repo.find 且 order 倒序 / take=limit', async () => {
    await service.findByUser('u2', 10);
    expect(fakeRepo.find).toHaveBeenCalledTimes(1);
    expect(fakeRepo.find).toHaveBeenCalledWith({
      where: { userId: 'u2' },
      order: { createdAt: 'DESC' },
      take: 10,
    });
  });
});
