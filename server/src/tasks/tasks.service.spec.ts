import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FindOperator, In, IsNull } from 'typeorm';
import { TasksService } from './tasks.service';
import { DailyTask } from '../entities/daily-task.entity';
import { TaskCompletion } from '../entities/task-completion.entity';

const todayStr = () => new Date().toISOString().split('T')[0];

/** 模拟 TypeORM `find` 按 where 条件（含 IsNull / 等值）过滤内存行。 */
function mockFindByWhere(rows: any[]): (opts?: any) => Promise<any[]> {
  return async (opts?: any) => {
    const conds = opts?.where ? (Array.isArray(opts.where) ? opts.where : [opts.where]) : [];
    return rows.filter((r) =>
      conds.some((cond: any) => {
        if (!cond) return false;
        return Object.entries(cond).every(([key, val]) => {
          if (val instanceof FindOperator && val.type === 'isNull') {
            return (r as any)[key] == null;
          }
          return (r as any)[key] === val;
        });
      }),
    );
  };
}

describe('TasksService', () => {
  let service: TasksService;
  let tasksRepo: any;
  let completionsRepo: any;

  beforeEach(async () => {
    tasksRepo = {
      find: jest.fn(),
      create: jest.fn((e) => e),
    };
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

  it('getDailyTasks 合并全局种子 + 该用户当日计划任务（AI-206 多租户隔离）', async () => {
    const t = todayStr();
    const allRows = [
      { id: 'g1', title: 'Global', description: '', icon: 'i', sortOrder: 0, userId: null, date: null }, // 全局种子
      { id: 'p1', title: 'PlanToday', description: '', icon: 'i', sortOrder: 1, userId: 'u1', date: t }, // u1 当天 → 含
      { id: 'p2', title: 'PlanFuture', description: '', icon: 'i', sortOrder: 2, userId: 'u1', date: '2099-01-01' }, // u1 非当天 → 排除
      { id: 'p3', title: 'OtherUser', description: '', icon: 'i', sortOrder: 3, userId: 'u2', date: t }, // 他人 → 排除
    ];
    tasksRepo.find.mockImplementation(mockFindByWhere(allRows));
    completionsRepo.find.mockResolvedValue([]);

    const res = await service.getDailyTasks('u1');

    // 查询条件：全局(userId IS NULL) + 该用户当日
    expect(tasksRepo.find).toHaveBeenCalledWith({
      where: [{ userId: IsNull() }, { userId: 'u1', date: t }],
      order: { sortOrder: 'ASC' },
    });
    // 仅返回全局种子 + 该用户当日计划任务（p2/p3 被 where 排除）
    expect(res.map((r) => r.id)).toEqual(['g1', 'p1']);
  });

  it('replacePlanTasks 先删后插（AI-206 重应用无重复）', async () => {
    tasksRepo.delete = jest.fn(async () => ({ affected: 1 }));
    tasksRepo.save = jest.fn(async (e: any) => e);
    const entries = [
      { title: '第1天', description: '颜色', icon: 'pencil', sortOrder: 0, userId: 'u1', planDayId: 'd1', date: todayStr() },
    ];

    await service.replacePlanTasks('u1', ['d1', 'd2'], entries);

    expect(tasksRepo.delete).toHaveBeenCalledWith({ userId: 'u1', planDayId: In(['d1', 'd2']) });
    expect(tasksRepo.save).toHaveBeenCalledTimes(1);
    const saved = (tasksRepo.save as jest.Mock).mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0].title).toBe('第1天');
  });

  it('replacePlanTasks 无 planDayIds 时仅插入不删除', async () => {
    tasksRepo.delete = jest.fn(async () => ({ affected: 0 }));
    tasksRepo.save = jest.fn(async (e: any) => e);
    await service.replacePlanTasks('u1', [], []);
    expect(tasksRepo.delete).not.toHaveBeenCalled();
    expect(tasksRepo.save).not.toHaveBeenCalled();
  });
});
