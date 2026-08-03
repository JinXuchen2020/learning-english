import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { DailyTask } from '../entities/daily-task.entity';
import { TaskCompletion } from '../entities/task-completion.entity';

const todayStr = () => new Date().toISOString().split('T')[0];

describe('TasksService', () => {
  let service: TasksService;
  let tasksRepo: any;
  let completionsRepo: any;

  beforeEach(async () => {
    tasksRepo = { find: jest.fn() };
    completionsRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((e) => e),
      save: jest.fn(async (e) => e),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getRepositoryToken(DailyTask), useValue: tasksRepo },
        { provide: getRepositoryToken(TaskCompletion), useValue: completionsRepo },
      ],
    }).compile();
    service = moduleRef.get(TasksService);
  });

  it('getDailyTasks marks completed by today completions', async () => {
    const t = todayStr();
    tasksRepo.find.mockResolvedValue([{ id: 't1', title: 'A', description: '', icon: 'i', sortOrder: 1 }]);
    completionsRepo.find.mockResolvedValue([{ taskId: 't1', date: t }]);
    const res = await service.getDailyTasks('u1');
    expect(completionsRepo.find).toHaveBeenCalledWith({ where: { userId: 'u1', date: t } });
    expect(res[0].completed).toBe(true);
  });

  it('getDailyTasks marks not-completed when no completion today', async () => {
    tasksRepo.find.mockResolvedValue([{ id: 't1' }]);
    completionsRepo.find.mockResolvedValue([]);
    const res = await service.getDailyTasks('u1');
    expect(res[0].completed).toBe(false);
  });

  it('completeTask returns alreadyCompleted when exists today', async () => {
    completionsRepo.findOne.mockResolvedValue({ id: 'c1' });
    const res = await service.completeTask('u1', 't1');
    expect(res).toEqual({ success: true, alreadyCompleted: true });
    expect(completionsRepo.save).not.toHaveBeenCalled();
  });

  it('completeTask creates completion when none today', async () => {
    const t = todayStr();
    completionsRepo.findOne.mockResolvedValue(null);
    const res = await service.completeTask('u1', 't1');
    expect(completionsRepo.create).toHaveBeenCalledWith({ userId: 'u1', taskId: 't1', date: t });
    expect(res).toEqual({ success: true, alreadyCompleted: false });
  });
});
