import { Test } from '@nestjs/testing';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

describe('ProgressController', () => {
  let controller: ProgressController;
  let progressService: any;

  beforeEach(async () => {
    progressService = {
      getOverview: jest.fn().mockResolvedValue({}),
      completeLesson: jest.fn().mockResolvedValue({}),
      recordWordAttempt: jest.fn().mockResolvedValue({}),
      getDueReviews: jest.fn().mockResolvedValue([]),
      getReviewSettings: jest.fn().mockReturnValue({ enabled: true, intervals: [1, 2, 4, 7, 15, 30, 60] }),
      scheduleReview: jest.fn().mockResolvedValue({ wordId: 'w1', dueDate: new Date(), intervalDays: 1, easeFactor: 2.5, reviewCount: 1 }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ProgressController],
      providers: [{ provide: ProgressService, useValue: progressService }],
    }).compile();
    controller = moduleRef.get(ProgressController);
  });

  it('getOverview uses req.user.userId', async () => {
    await controller.getOverview({ user: { userId: 'u1' } } as any);
    expect(progressService.getOverview).toHaveBeenCalledWith('u1');
  });

  it('completeLesson uses req.user.userId + param', async () => {
    await controller.completeLesson('l1', { user: { userId: 'u1' } } as any);
    expect(progressService.completeLesson).toHaveBeenCalledWith('u1', 'l1');
  });

  it('recordWord forwards body + userId', async () => {
    await controller.recordWord({ wordId: 'w1', correct: true } as any, { user: { userId: 'u1' } } as any);
    expect(progressService.recordWordAttempt).toHaveBeenCalledWith('u1', 'w1', true);
  });

  it('getDueReviews uses req.user.userId (AI-605)', async () => {
    await controller.getDueReviews({ user: { userId: 'u1' } } as any);
    expect(progressService.getDueReviews).toHaveBeenCalledWith('u1');
  });

  it('getReviewSettings returns settings (AI-605)', async () => {
    const res = await controller.getReviewSettings({ user: { userId: 'u1' } } as any);
    expect(res.enabled).toBe(true);
    expect(Array.isArray(res.intervals)).toBe(true);
  });

  it('scheduleReview forwards wordId + parsed dueDate (AI-605)', async () => {
    await controller.scheduleReview(
      { wordId: 'w1', dueDate: '2026-08-20T00:00:00.000Z' } as any,
      { user: { userId: 'u1' } } as any,
    );
    expect(progressService.scheduleReview).toHaveBeenCalledWith('u1', 'w1', expect.any(Date));
  });
});
