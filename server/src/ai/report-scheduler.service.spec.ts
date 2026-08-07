import { ReportSchedulerService } from './report-scheduler.service';
import { AiReportService } from './ai-report.service';
import { WeeklyReportService } from './weekly-report.service';

/** 构造调度服务（直接 new，不触发 onModuleInit，避免测试挂真定时器）。 */
function makeService(overrides: {
  users?: any[];
  generate?: any;
  weekly?: any;
} = {}) {
  const aiReportService: AiReportService = {
    name: 'mock',
    generateDailyReport:
      overrides.generate ||
      jest.fn(async () => ({ userId: 'u', date: '2026-08-07' })),
  } as unknown as AiReportService;
  const weeklyReportService: WeeklyReportService = {
    generateAndSendWeeklyReport:
      overrides.weekly ||
      jest.fn(async () => ({ skipped: true, reason: 'no-recipient', weekStart: '2026-08-03' })),
  } as unknown as WeeklyReportService;
  const userRepo: any = {
    find: jest.fn(async () => overrides.users ?? []),
  };
  const svc = new ReportSchedulerService(aiReportService, userRepo, weeklyReportService);
  return { svc, aiReportService, weeklyReportService, userRepo };
}

const MS_10H = 10 * 60 * 60 * 1000;
const MS_23H = 23 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

describe('ReportSchedulerService.computeMsUntilNext (AI-505)', () => {
  it('当前 < 目标时刻 → 返回到今日该时刻的延迟', () => {
    const svc = makeService().svc;
    const now = new Date(2026, 7, 7, 10, 0, 0, 0); // 本地 10:00
    expect(svc.computeMsUntilNext(20, now)).toBe(MS_10H); // 到今日 20:00
  });

  it('当前 ≥ 目标时刻 → 返回到明日该时刻（约 23h/24h）', () => {
    const svc = makeService().svc;
    const now = new Date(2026, 7, 7, 21, 0, 0, 0); // 本地 21:00，已过 20:00
    expect(svc.computeMsUntilNext(20, now)).toBe(MS_23H); // 到明日 20:00
  });

  it('恰好在目标时刻整点 → 顺延到明日（不立即触发）', () => {
    const svc = makeService().svc;
    const now = new Date(2026, 7, 7, 20, 0, 0, 0);
    expect(svc.computeMsUntilNext(20, now)).toBe(DAY_MS);
  });
});

describe('ReportSchedulerService.computeMsUntilNextWeekday (AI-506)', () => {
  it('周五 10:00 → 距本周日 20:00 = 2 天 10 小时', () => {
    const svc = makeService().svc;
    const now = new Date(2026, 7, 7, 10, 0, 0, 0); // 周五
    // 周日 = day 0；周五到周日 2 天 + 当天 10:00→20:00 的 10 小时
    expect(svc.computeMsUntilNextWeekday(0, 20, now)).toBe(2 * DAY_MS + MS_10H);
  });

  it('周日 10:00 → 距今日 20:00 = 10 小时（未过）', () => {
    const svc = makeService().svc;
    const now = new Date(2026, 7, 9, 10, 0, 0, 0); // 周日
    expect(svc.computeMsUntilNextWeekday(0, 20, now)).toBe(MS_10H);
  });

  it('周日 21:00 → 已过今日 20:00 → 顺延到下周日（约 6 天 23 小时）', () => {
    const svc = makeService().svc;
    const now = new Date(2026, 7, 9, 21, 0, 0, 0); // 周日 21:00
    const expected = 6 * DAY_MS + 23 * 60 * 60 * 1000;
    expect(svc.computeMsUntilNextWeekday(0, 20, now)).toBe(expected);
  });
});

describe('ReportSchedulerService.runDailySweep (AI-505 Trigger B)', () => {
  it('遍历所有用户各调一次 generateDailyReport', async () => {
    const { svc, aiReportService, userRepo } = makeService({
      users: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }],
    });
    await svc.runDailySweep();
    expect(userRepo.find).toHaveBeenCalledTimes(1);
    expect(aiReportService.generateDailyReport).toHaveBeenCalledTimes(3);
    expect(aiReportService.generateDailyReport).toHaveBeenNthCalledWith(1, 'u1');
    expect(aiReportService.generateDailyReport).toHaveBeenNthCalledWith(2, 'u2');
    expect(aiReportService.generateDailyReport).toHaveBeenNthCalledWith(3, 'u3');
  });

  it('无用户 → 不调 generateDailyReport', async () => {
    const { svc, aiReportService } = makeService({ users: [] });
    await svc.runDailySweep();
    expect(aiReportService.generateDailyReport).not.toHaveBeenCalled();
  });

  it('单个用户失败不中断整轮、不 reject（逐用户容错）', async () => {
    const generate = jest.fn();
    generate.mockImplementation(async (id: string) => {
      if (id === 'u1') throw new Error('AI boom');
      return { userId: id, date: '2026-08-07' };
    });
    const { svc, aiReportService } = makeService({ users: [{ id: 'u1' }, { id: 'u2' }], generate });
    await expect(svc.runDailySweep()).resolves.toBeUndefined();
    expect(aiReportService.generateDailyReport).toHaveBeenNthCalledWith(2, 'u2');
  });
});

describe('ReportSchedulerService.runWeeklySweep (AI-506 Trigger C)', () => {
  it('仅对含 parentEmail 的用户生成周报；无邮箱者跳过', async () => {
    const { svc, weeklyReportService } = makeService({
      users: [
        { id: 'u1', parentEmail: 'p1@x.com' },
        { id: 'u2', parentEmail: null },
        { id: 'u3', parentEmail: 'p3@x.com' },
      ],
    });
    await svc.runWeeklySweep();
    expect(weeklyReportService.generateAndSendWeeklyReport).toHaveBeenCalledTimes(2);
    expect(weeklyReportService.generateAndSendWeeklyReport).toHaveBeenNthCalledWith(1, 'u1');
    expect(weeklyReportService.generateAndSendWeeklyReport).toHaveBeenNthCalledWith(2, 'u3');
  });

  it('无用户 → 不调生成', async () => {
    const { svc, weeklyReportService } = makeService({ users: [] });
    await svc.runWeeklySweep();
    expect(weeklyReportService.generateAndSendWeeklyReport).not.toHaveBeenCalled();
  });

  it('单个用户周报失败不中断整轮（逐用户容错）', async () => {
    const weekly = jest.fn();
    weekly.mockImplementation(async (id: string) => {
      if (id === 'u1') throw new Error('boom');
      return { skipped: true, reason: 'no-recipient', weekStart: '2026-08-03' };
    });
    const { svc, weeklyReportService } = makeService({
      users: [
        { id: 'u1', parentEmail: 'p1@x.com' },
        { id: 'u2', parentEmail: 'p2@x.com' },
      ],
      weekly,
    });
    await expect(svc.runWeeklySweep()).resolves.toBeUndefined();
    expect(weeklyReportService.generateAndSendWeeklyReport).toHaveBeenCalledTimes(2);
  });
});

describe('ReportSchedulerService 调度生命周期 (AI-505/506)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('startDaily 注册定时器、stopDaily 清除', () => {
    const { svc } = makeService();
    svc.startDaily();
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    svc.stopDaily();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('startWeekly 注册定时器、stopWeekly 清除', () => {
    const { svc } = makeService();
    svc.startWeekly();
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    svc.stopWeekly();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('每日到点触发一次 runDailySweep', () => {
    const { svc } = makeService({ users: [{ id: 'u1' }] });
    const sweepSpy = jest.spyOn(svc, 'runDailySweep').mockResolvedValue();
    const now = new Date(2026, 7, 7, 10, 0, 0, 0);
    jest.setSystemTime(now);
    svc.startDaily();
    const delay = svc.computeMsUntilNext(20, now);
    jest.advanceTimersByTime(delay);
    expect(sweepSpy).toHaveBeenCalledTimes(1);
    svc.stopDaily();
  });

  it('每周到点触发一次 runWeeklySweep', () => {
    const { svc } = makeService({ users: [{ id: 'u1', parentEmail: 'p@x.com' }] });
    const sweepSpy = jest.spyOn(svc, 'runWeeklySweep').mockResolvedValue();
    const now = new Date(2026, 7, 7, 10, 0, 0, 0); // 周五
    jest.setSystemTime(now);
    svc.startWeekly();
    const delay = svc.computeMsUntilNextWeekday(0, 20, now); // 2 天 10 小时
    jest.advanceTimersByTime(delay);
    expect(sweepSpy).toHaveBeenCalledTimes(1);
    svc.stopWeekly();
  });
});
