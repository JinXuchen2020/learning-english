import { Repository } from 'typeorm';
import { ProgressAggregationService } from './progress-aggregation.service';
import { User } from '../entities/user.entity';
import { StudyPlan } from '../plan/study-plan.entity';
import { StudyPlanDay } from '../plan/study-plan-day.entity';
import { WordProgress } from '../entities/word-progress.entity';
import { Word } from '../entities/word.entity';
import { TaskCompletion } from '../entities/task-completion.entity';
import { NotFoundException } from '@nestjs/common';
import { ParentService } from './parent.service';

function makeChild(over: Partial<User> = {}): User {
  const base: User = {
    id: 'child-1',
    username: 'kid1',
    password: 'x',
    nickname: '小狐狸',
    totalStars: 12,
    level: 2,
    streakDays: 3,
    lastActiveDate: '2026-08-10',
    parentId: 'parent-1',
    childProviderConfigId: null,
    role: 'child',
    createdAt: new Date('2026-08-01'),
  } as unknown as User;
  return { ...base, ...over };
}

function repoMock<T>(impl: Partial<Record<keyof T, jest.Mock>>) {
  return impl as unknown as jest.Mocked<T>;
}

describe('ProgressAggregationService (AI-712)', () => {
  let usersRepo: jest.Mocked<Repository<User>>;
  let studyPlanRepo: jest.Mocked<Repository<StudyPlan>>;
  let studyPlanDayRepo: jest.Mocked<Repository<StudyPlanDay>>;
  let wordProgressRepo: jest.Mocked<Repository<WordProgress>>;
  let wordRepo: jest.Mocked<Repository<Word>>;
  let taskCompletionRepo: jest.Mocked<Repository<TaskCompletion>>;
  let service: ProgressAggregationService;

  beforeEach(() => {
    usersRepo = repoMock<Repository<User>>({ find: jest.fn() });
    studyPlanRepo = repoMock<Repository<StudyPlan>>({ find: jest.fn() });
    studyPlanDayRepo = repoMock<Repository<StudyPlanDay>>({ find: jest.fn() });
    wordProgressRepo = repoMock<Repository<WordProgress>>({ find: jest.fn() });
    wordRepo = repoMock<Repository<Word>>({ find: jest.fn() });
    taskCompletionRepo = repoMock<Repository<TaskCompletion>>({ count: jest.fn() });
    service = new ProgressAggregationService(
      usersRepo,
      studyPlanRepo,
      studyPlanDayRepo,
      wordProgressRepo,
      wordRepo,
      taskCompletionRepo,
    );
  });

  describe('getDashboard', () => {
    it('maps each owned child to a summary with correct fields', async () => {
      const childA = makeChild({ id: 'a', nickname: 'A', totalStars: 10, level: 1, streakDays: 2 });
      const childB = makeChild({ id: 'b', nickname: 'B', totalStars: 30, level: 3, streakDays: 5 });
      usersRepo.find.mockResolvedValue([childA, childB]);
      // 无 applied 计划 → planCompletionRatio = 0
      studyPlanRepo.find.mockResolvedValue([]);

      const result = await service.getDashboard('parent-1');

      expect(usersRepo.find).toHaveBeenCalledWith({
        where: { parentId: 'parent-1', role: 'child' },
        order: { createdAt: 'ASC' },
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        childId: 'a',
        nickname: 'A',
        totalStars: 10,
        level: 1,
        streakDays: 2,
        planCompletionRatio: 0,
        hasProviderOverride: false,
      });
      expect(result[1].childId).toBe('b');
      expect(result[1].totalStars).toBe(30);
    });
  });

  describe('getChildSummary / planCompletionRatio', () => {
    it('computes plan completion ratio across applied plans', async () => {
      const child = makeChild();
      const plan: Partial<StudyPlan> = {
        days: [
          { skillType: 'vocab', isDone: true } as StudyPlanDay,
          { skillType: 'vocab', isDone: false } as StudyPlanDay,
          { skillType: 'speak', isDone: false } as StudyPlanDay,
        ] as StudyPlanDay[],
      };
      studyPlanRepo.find.mockResolvedValue([plan as StudyPlan]);

      const summary = await service.getChildSummary(child);
      expect(summary.planCompletionRatio).toBeCloseTo(1 / 3);
    });

    it('returns 0 when no applied plan exists', async () => {
      studyPlanRepo.find.mockResolvedValue([]);
      const summary = await service.getChildSummary(makeChild());
      expect(summary.planCompletionRatio).toBe(0);
    });
  });

  describe('getChildDetail', () => {
    it('aggregates weak words, skill mastery and weekly trend', async () => {
      const child = makeChild();

      studyPlanRepo.find.mockResolvedValue([
        {
          days: [
            { skillType: 'vocab', isDone: true } as StudyPlanDay,
            { skillType: 'vocab', isDone: false } as StudyPlanDay,
            { skillType: 'speak', isDone: false } as StudyPlanDay,
          ],
        } as StudyPlan,
      ]);

      wordProgressRepo.find.mockResolvedValue([
        { attempts: 3, correctCount: 1, word: { text: 'apple' } } as WordProgress,
        { attempts: 1, correctCount: 1, word: { text: 'banana' } } as WordProgress, // 全对，排除
        { attempts: 2, correctCount: 0, wordId: 'w3' } as WordProgress, // word 为 null → 退用 wordId
      ] as WordProgress[]);

      // 近 7 日任务数：升序 0,1,2,3,4,5,6
      let call = 0;
      taskCompletionRepo.count.mockImplementation(() => Promise.resolve(call++));

      const detail = await service.getChildDetail(child);

      // 薄弱词：apple(2) 与 w3(2) 并列，banana 被排除
      expect(detail.weakWords).toContainEqual({ word: 'apple', wrongCount: 2 });
      expect(detail.weakWords).toContainEqual({ word: 'w3', wrongCount: 2 });
      expect(detail.weakWords.find((w) => w.word === 'banana')).toBeUndefined();
      expect(detail.weakWords.length).toBe(2);

      // 技能掌握度
      const vocab = detail.skillMastery.find((s) => s.skillType === 'vocab');
      const speak = detail.skillMastery.find((s) => s.skillType === 'speak');
      expect(vocab?.ratio).toBeCloseTo(0.5);
      expect(speak?.ratio).toBe(0);

      // 周趋势：固定 7 日
      expect(detail.weeklyTrend).toHaveLength(7);
      expect(detail.weeklyTrend[0].stars).toBe(0);
      expect(detail.weeklyTrend[6].stars).toBe(6);

      // summary 透传
      expect(detail.summary.childId).toBe('child-1');
    });
  });
});

describe('ParentService.findOwnedChild (AI-712 越权防护)', () => {
  let usersRepo: jest.Mocked<Repository<User>>;
  let providerConfigRepo: jest.Mocked<Repository<any>>;
  let service: ParentService;

  beforeEach(() => {
    usersRepo = repoMock<Repository<User>>({ findOne: jest.fn() });
    providerConfigRepo = repoMock<Repository<any>>({ findOne: jest.fn(), find: jest.fn() });
    service = new ParentService(usersRepo, providerConfigRepo, {} as any);
  });

  it('returns the child when it belongs to the requesting parent', async () => {
    const child = makeChild();
    usersRepo.findOne.mockResolvedValue(child);
    const result = await service.findOwnedChild('parent-1', 'child-1');
    expect(result).toBe(child);
  });

  it('returns null when child belongs to another parent', async () => {
    usersRepo.findOne.mockResolvedValue(makeChild({ parentId: 'parent-2' }));
    const result = await service.findOwnedChild('parent-1', 'child-1');
    expect(result).toBeNull();
  });

  it('returns null when child does not exist', async () => {
    usersRepo.findOne.mockResolvedValue(null);
    const result = await service.findOwnedChild('parent-1', 'child-1');
    expect(result).toBeNull();
  });
});
