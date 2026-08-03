import { Test } from '@nestjs/testing';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

describe('TasksController', () => {
  let controller: TasksController;
  let tasksService: any;

  beforeEach(async () => {
    tasksService = {
      getDailyTasks: jest.fn().mockResolvedValue([]),
      completeTask: jest.fn().mockResolvedValue({}),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [{ provide: TasksService, useValue: tasksService }],
    }).compile();
    controller = moduleRef.get(TasksController);
  });

  it('getDailyTasks uses req.user.userId', async () => {
    await controller.getDailyTasks({ user: { userId: 'u1' } } as any);
    expect(tasksService.getDailyTasks).toHaveBeenCalledWith('u1');
  });

  it('completeTask uses req.user.userId + param', async () => {
    await controller.completeTask('t1', { user: { userId: 'u1' } } as any);
    expect(tasksService.completeTask).toHaveBeenCalledWith('u1', 't1');
  });
});
