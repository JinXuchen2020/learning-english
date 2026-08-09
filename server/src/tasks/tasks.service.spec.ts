import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FindOperator, In, IsNull } from 'typeorm';
import { TasksService } from './tasks.service';
import { DailyTask } from '../entities/daily-task.entity';
import { TaskCompletion } from '../entities/task-completion.entity';
import { StudyPlanDay } from '../plan/study-plan-day.entity';
import { AiReportService } from '../ai/ai-report.service';
import { ProgressService } from '../progress/progress.service';
import { RewardsService } from '../rewards/rewards.service';
import { POINT_RULES } from '../rewards/points.const';

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
  let dayRepo: any;
  let aiReportService: any;
  let progressService: any;
  let rewardsService: any;

  beforeEach(async () => {
    tasksRepo = {
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => ({ id: 't1', planDayId: null })),
      create: jest.fn((e) => e),
    };
    completionsRepo = {
      find: jest.fn(async () => []),
      findOne: jest.fn(),
      create: jest.fn((e) => e),
      save: jest.fn(async (e) => e),
    };
    dayRepo = {
      update: jest.fn(async () => ({ affected: 1 })),
    };
    aiReportService = {
      generateDailyReport: jest.fn(async () => ({ userId: 'u1', date: '2026-08-07' })),
    };
    progressService = {
      getDueReviews: jest.fn(async () => []),
    };
    rewardsService = {
      awardStars: jest.fn(async () => undefined),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getRepositoryToken(DailyTask), useValue: tasksRepo },
        { provide: getRepositoryToken(TaskCompletion), useValue: completionsRepo },
        { provide: getRepositoryToken(StudyPlanDay), useValue: dayRepo },
        { provide: AiReportService, useValue: aiReportService },
        { provide: ProgressService, useValue: progressService },
        { provide: RewardsService, useValue: rewardsService },
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

  it('completeTask returns alreadyCompleted when exists today (不累加积分)', async () => {
    completionsRepo.findOne.mockResolvedValue({ id: 'c1' });
    const res = await service.completeTask('u1', 't1');
    expect(res).toEqual({ success: true, alreadyCompleted: true });
    expect(completionsRepo.save).not.toHaveBeenCalled();
    expect(rewardsService.awardStars).not.toHaveBeenCalled();
  });

  it('completeTask creates completion when none today (AI-701 新完成累加积分)', async () => {
    const t = todayStr();
    completionsRepo.findOne.mockResolvedValue(null);
    const res = await service.completeTask('u1', 't1');
    expect(completionsRepo.create).toHaveBeenCalledWith({ userId: 'u1', taskId: 't1', date: t });
    expect(rewardsService.awardStars).toHaveBeenCalledWith('u1', POINT_RULES.TASK_COMPLETE);
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

  it('getDailyTasks 注入到期复习任务为 review 链接项（AI-605）', async () => {
    const t = todayStr();
    tasksRepo.find.mockImplementation(
      mockFindByWhere([{ id: 'g1', title: 'Seed', description: '', icon: 'i', sortOrder: 0, userId: null, date: null }]),
    );
    completionsRepo.find.mockResolvedValue([]);
    progressService.getDueReviews.mockResolvedValue([
      {
        wordId: 'w-cat',
        wordText: 'Cat',
        meaning: '猫',
        dueDate: new Date().toISOString(),
        reviewPriority: 80,
        difficulty: 'easy',
        intervalDays: 1,
      },
    ]);

    const res = await service.getDailyTasks('u1');

    const reviewItem = res.find((r: any) => r.id === 'review:w-cat') as any;
    expect(reviewItem).toBeDefined();
    expect(reviewItem.icon).toBe('review');
    expect(reviewItem.reviewWordText).toBe('Cat');
    expect(reviewItem.completed).toBe(false);
    // 基础任务 + 1 条注入复习项
    expect(res.filter((r: any) => r.id === 'g1')).toHaveLength(1);
  });

  it('getDailyReviews 失败时主任务列表仍返回（AI-605 容错）', async () => {
    const t = todayStr();
    tasksRepo.find.mockImplementation(
      mockFindByWhere([{ id: 'g1', title: 'Seed', description: '', icon: 'i', sortOrder: 0, userId: null, date: null }]),
    );
    completionsRepo.find.mockResolvedValue([]);
    progressService.getDueReviews.mockRejectedValue(new Error('db down'));

    const res = await service.getDailyTasks('u1');
    expect(res.map((r: any) => r.id)).toEqual(['g1']); // 仅基础任务，注入被跳过
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

  it('completeTask 对 plan 任务回写 study_plan_days.isDone（AI-209）', async () => {
    tasksRepo.findOne.mockResolvedValue({ id: 't1', planDayId: 'd9' });
    completionsRepo.findOne.mockResolvedValue(null);
    const res = await service.completeTask('u1', 't1');
    expect(dayRepo.update).toHaveBeenCalledWith({ id: 'd9' }, { isDone: true });
    expect(res).toEqual({ success: true, alreadyCompleted: false });
  });

  it('completeTask 对全局种子任务（planDayId 空）不回写（AI-209）', async () => {
    tasksRepo.findOne.mockResolvedValue({ id: 't1', planDayId: null });
    completionsRepo.findOne.mockResolvedValue(null);
    await service.completeTask('u1', 't1');
    expect(dayRepo.update).not.toHaveBeenCalled();
  });

  it('completeTask 已完成后仍回写（幂等无害，AI-209）', async () => {
    tasksRepo.findOne.mockResolvedValue({ id: 't1', planDayId: 'd9' });
    completionsRepo.findOne.mockResolvedValue({ id: 'c1' });
    const res = await service.completeTask('u1', 't1');
    expect(dayRepo.update).toHaveBeenCalledWith({ id: 'd9' }, { isDone: true });
    expect(completionsRepo.save).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true, alreadyCompleted: true });
  });

  // ===== AI-505 Trigger A：完成当日全部任务 → 自动触发生成报告 =====

  it('AI-505 完成当日全部任务（新完成）后触发生成报告一次', async () => {
    const t = todayStr();
    tasksRepo.findOne.mockResolvedValue({ id: 'g1', planDayId: null });
    completionsRepo.findOne.mockResolvedValue(null);
    // 当日仅一个全局种子任务 g1，且已完成 → getDailyTasks 判定全部完成
    tasksRepo.find.mockImplementation(
      mockFindByWhere([{ id: 'g1', title: 'Seed', description: '', icon: 'i', sortOrder: 0, userId: null, date: null }]),
    );
    completionsRepo.find.mockResolvedValue([{ taskId: 'g1', date: t }]);

    await service.completeTask('u1', 'g1');

    expect(aiReportService.generateDailyReport).toHaveBeenCalledTimes(1);
    expect(aiReportService.generateDailyReport).toHaveBeenCalledWith('u1');
  });

  it('AI-505 完成一项但非全部完成 → 不触发生成', async () => {
    const t = todayStr();
    tasksRepo.findOne.mockResolvedValue({ id: 'g2', planDayId: null });
    completionsRepo.findOne.mockResolvedValue(null);
    // 两个全局任务 g1/g2，仅 g1 已完成 → 未全部完成
    tasksRepo.find.mockImplementation(
      mockFindByWhere([
        { id: 'g1', title: 'A', description: '', icon: 'i', sortOrder: 0, userId: null, date: null },
        { id: 'g2', title: 'B', description: '', icon: 'i', sortOrder: 1, userId: null, date: null },
      ]),
    );
    completionsRepo.find.mockResolvedValue([{ taskId: 'g1', date: t }]);

    await service.completeTask('u1', 'g2');

    expect(aiReportService.generateDailyReport).not.toHaveBeenCalled();
  });

  it('AI-505 完成已完成的任务（alreadyCompleted）→ 不触发生成', async () => {
    tasksRepo.findOne.mockResolvedValue({ id: 'g1', planDayId: null });
    completionsRepo.findOne.mockResolvedValue({ id: 'c1' }); // 已完成 → 提前返回

    await service.completeTask('u1', 'g1');

    expect(aiReportService.generateDailyReport).not.toHaveBeenCalled();
  });

  it('AI-505 当日零任务（无可完成项）→ 不触发生成', async () => {
    const t = todayStr();
    tasksRepo.findOne.mockResolvedValue({ id: 'g1', planDayId: null });
    completionsRepo.findOne.mockResolvedValue(null);
    tasksRepo.find.mockImplementation(mockFindByWhere([])); // 无当日任务
    completionsRepo.find.mockResolvedValue([]);

    await service.completeTask('u1', 'g1');

    expect(aiReportService.generateDailyReport).not.toHaveBeenCalled();
  });
});
