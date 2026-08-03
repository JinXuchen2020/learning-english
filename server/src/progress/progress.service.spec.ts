import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProgressService } from './progress.service';
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

  it('recordWordAttempt initializes and returns counts on new progress', async () => {
    wordProgressRepo.findOne.mockResolvedValue(null);
    const res = await service.recordWordAttempt('u1', 'w1', true);
    expect(res).toEqual({ success: true, attempts: 1, correctCount: 1 });
  });

  it('recordWordAttempt accumulates attempts/correct on existing', async () => {
    wordProgressRepo.findOne.mockResolvedValue({ userId: 'u1', wordId: 'w1', attempts: 2, correctCount: 1 });
    const res = await service.recordWordAttempt('u1', 'w1', false);
    expect(res.attempts).toBe(3);
    expect(res.correctCount).toBe(1);
  });
});
