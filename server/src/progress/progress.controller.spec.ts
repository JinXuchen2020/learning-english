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
});
