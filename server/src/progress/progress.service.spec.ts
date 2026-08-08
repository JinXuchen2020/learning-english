import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ProgressService,
  computeMastery,
  computeDifficulty,
  computeReviewPriority,
} from './progress.service';
import { LessonProgress } from '../entities/lesson-progress.entity';
import { WordProgress } from '../entities/word-progress.entity';
import { User } from '../entities/user.entity';

describe('ProgressService', () => {
  let service: ProgressService;
  let lessonProgressRepo: any;
  let wordProgressRepo: any;
  let usersRepo: any;

  beforeEach(async () => {
    lessonProgressRepo = {
      count: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((e) => ({ ...e })),
      save: jest.fn(async (e) => e),
    };
    wordProgressRepo = {
      count: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((e) => ({ ...e })),
      save: jest.fn(async (e) => e),
      find: jest.fn(),
    };
    usersRepo = { findOne: jest.fn(), increment: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProgressService,
        { provide: getRepositoryToken(LessonProgress), useValue: lessonProgressRepo },
        { provide: getRepositoryToken(WordProgress), useValue: wordProgressRepo },
        { provide: getRepositoryToken(User), useValue: usersRepo },
      ],
    }).compile();
    service = moduleRef.get(ProgressService);
  });

  it('getOverview aggregates counts with user fallback 0', async () => {
    lessonProgressRepo.count.mockResolvedValue(3);
    wordProgressRepo.count.mockResolvedValue(10);
    usersRepo.findOne.mockResolvedValue(null);
    const res = await service.getOverview('u1');
    expect(res).toEqual({ completedLessons: 3, practicedWords: 10, totalStars: 0, streakDays: 0 });
  });

  it('getOverview returns user stars/streak when present', async () => {
    lessonProgressRepo.count.mockResolvedValue(1);
    wordProgressRepo.count.mockResolvedValue(2);
    usersRepo.findOne.mockResolvedValue({ totalStars: 5, streakDays: 2 });
    const res = await service.getOverview('u1');
    expect(res.totalStars).toBe(5);
    expect(res.streakDays).toBe(2);
  });

  it('completeLesson creates progress, marks completed, increments stars', async () => {
    lessonProgressRepo.findOne.mockResolvedValue(null);
    const res = await service.completeLesson('u1', 'l1');
    expect(lessonProgressRepo.create).toHaveBeenCalledWith({ userId: 'u1', lessonId: 'l1' });
    expect(lessonProgressRepo.save).toHaveBeenCalled();
    expect(usersRepo.increment).toHaveBeenCalledWith({ id: 'u1' }, 'totalStars', 1);
    expect(res).toEqual({ success: true });
  });

  it('completeLesson reuses existing progress (no create)', async () => {
    lessonProgressRepo.findOne.mockResolvedValue({ userId: 'u1', lessonId: 'l1', completed: false });
    await service.completeLesson('u1', 'l1');
    expect(lessonProgressRepo.create).not.toHaveBeenCalled();
    expect(lessonProgressRepo.save).toHaveBeenCalled();
  });

  describe('recordWordAttempt (AI-602 adaptive)', () => {
    it('initializes new progress and returns counts + mastery + difficulty', async () => {
      wordProgressRepo.findOne.mockResolvedValue(null);
      const res = await service.recordWordAttempt('u1', 'w1', true);
      expect(res).toEqual({ success: true, attempts: 1, correctCount: 1, mastery: 100, difficulty: 'easy' });
    });

    it('accumulates attempts/correct and recomputes mastery/difficulty', async () => {
      wordProgressRepo.findOne.mockResolvedValue({
        userId: 'u1',
        wordId: 'w1',
        attempts: 2,
        correctCount: 1,
      });
      const res = await service.recordWordAttempt('u1', 'w1', false);
      expect(res.attempts).toBe(3);
      expect(res.correctCount).toBe(1);
      // mastery = round(1/3*100) = 33, attempts>=3 but <80 -> easy
      expect(res.mastery).toBe(33);
      expect(res.difficulty).toBe('easy');
    });

    it('upgrades to hard after >=3 attempts at >=80% mastery', async () => {
      wordProgressRepo.findOne.mockResolvedValue({
        userId: 'u1',
        wordId: 'w1',
        attempts: 3,
        correctCount: 3, // 100%
      });
      const res = await service.recordWordAttempt('u1', 'w1', true);
      expect(res.mastery).toBe(100);
      expect(res.difficulty).toBe('hard');
    });

    it('upgrades to medium at >=50% mastery after >=3 attempts', async () => {
      wordProgressRepo.findOne.mockResolvedValue({
        userId: 'u1',
        wordId: 'w1',
        attempts: 2,
        correctCount: 1, // 50%
      });
      const res = await service.recordWordAttempt('u1', 'w1', true);
      // attempts=3, correct=2 -> mastery=67 -> medium
      expect(res.mastery).toBe(67);
      expect(res.difficulty).toBe('medium');
    });

    it('persists difficulty/mastery onto the saved entity', async () => {
      wordProgressRepo.findOne.mockResolvedValue({
        userId: 'u1',
        wordId: 'w1',
        attempts: 3,
        correctCount: 3,
      });
      await service.recordWordAttempt('u1', 'w1', true);
      const saved = wordProgressRepo.save.mock.calls[0][0];
      expect(saved.difficulty).toBe('hard');
      expect(saved.mastery).toBe(100);
    });
  });

  describe('getWordDifficulties (AI-602)', () => {
    it('returns items sorted by reviewPriority desc (weak words first)', async () => {
      wordProgressRepo.find.mockResolvedValue([
        { userId: 'u1', wordId: 'w-strong', attempts: 5, correctCount: 5, mastery: 100, difficulty: 'hard', lastPracticedAt: new Date() },
        { userId: 'u1', wordId: 'w-weak', attempts: 4, correctCount: 1, mastery: 25, difficulty: 'easy', lastPracticedAt: new Date(Date.now() - 10 * 86400000) },
      ]);
      const items = await service.getWordDifficulties('u1');
      expect(items[0].wordId).toBe('w-weak'); // 弱词优先级更高
      expect(items[0].reviewPriority).toBeGreaterThan(items[1].reviewPriority);
    });

    it('returns empty array when no progress', async () => {
      wordProgressRepo.find.mockResolvedValue([]);
      const items = await service.getWordDifficulties('u1');
      expect(items).toEqual([]);
    });
  });

  describe('review scheduling (AI-605)', () => {
    function mockBuilder(rows: any[]): any {
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(rows),
      };
      wordProgressRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
      return qb;
    }

    it('getDueReviews returns due words joined with Word text/meaning, sorted by dueDate', async () => {
      const past = new Date(Date.now() - 2 * 86400000);
      const qb = mockBuilder([
        {
          userId: 'u1', wordId: 'w-cat', mastery: 60, difficulty: 'easy',
          lastPracticedAt: new Date(Date.now() - 5 * 86400000), intervalDays: 1,
          dueDate: past, word: { text: 'Cat', meaning: '猫' },
        },
      ]);

      const res = await service.getDueReviews('u1');

      // 查询条件：userId + dueDate 非空 + dueDate <= now
      expect(wordProgressRepo.createQueryBuilder).toHaveBeenCalledWith('wp');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('wp.word', 'word');
      expect(qb.andWhere).toHaveBeenCalledWith('wp.dueDate <= :date', expect.any(Object));
      expect(res).toHaveLength(1);
      expect(res[0].wordId).toBe('w-cat');
      expect(res[0].wordText).toBe('Cat');
      expect(res[0].meaning).toBe('猫');
      expect(res[0].dueDate).toBe(past.toISOString());
      expect(res[0].intervalDays).toBe(1);
    });

    it('getDueReviews returns [] when builder yields nothing', async () => {
      mockBuilder([]);
      const res = await service.getDueReviews('u1');
      expect(res).toEqual([]);
    });

    it('scheduleReview updates dueDate for an existing word', async () => {
      wordProgressRepo.findOne.mockResolvedValue({
        userId: 'u1', wordId: 'w-cat', dueDate: new Date(), intervalDays: 1, easeFactor: 2.5, reviewCount: 1,
      });
      wordProgressRepo.save.mockImplementation(async (e: any) => e);
      const target = new Date('2026-08-20T00:00:00.000Z');

      const updated = await service.scheduleReview('u1', 'w-cat', target);

      expect(wordProgressRepo.findOne).toHaveBeenCalledWith({ where: { userId: 'u1', wordId: 'w-cat' } });
      expect(updated?.dueDate).toBe(target);
      expect(wordProgressRepo.save).toHaveBeenCalled();
    });

    it('scheduleReview returns null for a word never practiced (→ 404)', async () => {
      wordProgressRepo.findOne.mockResolvedValue(null);
      const updated = await service.scheduleReview('u1', 'w-missing', new Date());
      expect(updated).toBeNull();
      expect(wordProgressRepo.save).not.toHaveBeenCalled();
    });
  });
});

describe('difficulty pure helpers (AI-602)', () => {
  it('computeMastery handles zero attempts and rounding', () => {
    expect(computeMastery(0, 0)).toBe(0);
    expect(computeMastery(1, 1)).toBe(100);
    expect(computeMastery(3, 1)).toBe(33);
    expect(computeMastery(3, 2)).toBe(67);
  });

  it('computeDifficulty upgrades by mastery + attempts thresholds', () => {
    expect(computeDifficulty(100, 1)).toBe('easy'); // 次数不够
    expect(computeDifficulty(100, 2)).toBe('easy'); // 次数不够
    expect(computeDifficulty(100, 3)).toBe('hard');
    expect(computeDifficulty(80, 3)).toBe('hard');
    expect(computeDifficulty(79, 3)).toBe('medium'); // >=50 未达 80
    expect(computeDifficulty(50, 3)).toBe('medium');
    expect(computeDifficulty(49, 3)).toBe('easy'); // 掌握度不足
    expect(computeDifficulty(0, 1)).toBe('easy');
  });

  it('computeReviewPriority weights mastery and recency', () => {
    const now = Date.now();
    const fresh = computeReviewPriority(100, new Date(now));
    const stale = computeReviewPriority(100, new Date(now - 5 * 86400000));
    const weak = computeReviewPriority(20, new Date(now));
    expect(stale).toBeGreaterThan(fresh); // 久未练权重更高
    expect(weak).toBeGreaterThan(fresh); // 掌握度低权重更高
    expect(computeReviewPriority(0, null)).toBeGreaterThan(0); // 未练有基础权重
  });
});
