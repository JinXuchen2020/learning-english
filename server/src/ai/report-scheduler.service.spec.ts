import { ReportSchedulerService } from './report-scheduler.service';
import { AiReportService } from './ai-report.service';

/** 构造调度服务（直接 new，不触发 onModuleInit，避免测试挂真定时器）。 */
function makeService(overrides: { users?: any[]; generate?: any } = {}) {
  const aiReportService: AiReportService = {
    name: 'mock',
    generateDailyReport:
      overrides.generate ||
      jest.fn(async () => ({ userId: 'u', date: '2026-08-07' })),
  } as unknown as AiReportService;
  const userRepo: any = {
    find: jest.fn(async () => overrides.users ?? []),
  };
  const svc = new ReportSchedulerService(aiReportService, userRepo);
  return { svc, aiReportService, userRepo };
}

const MS_10H = 10 * 60 * 60 * 1000;
const MS_23H = 23 * 60 * 60 * 1000;

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
    expect(svc.computeMsUntilNext(20, now)).toBe(24 * 60 * 60 * 1000);
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
    const { svc, aiReportService } = makeService({
      users: [{ id: 'u1' }, { id: 'u2' }],
      generate,
    });

    await expect(svc.runDailySweep()).resolves.toBeUndefined();
    // u2 仍被处理
    expect(aiReportService.generateDailyReport).toHaveBeenNthCalledWith(2, 'u2');
  });
});

describe('ReportSchedulerService 调度生命周期 (AI-505)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('start 注册定时器、stop 清除', () => {
    const { svc } = makeService();
    svc.start();
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    svc.stop();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('到点触发一次 runDailySweep（随后进入每日 interval）', () => {
    const { svc } = makeService({ users: [{ id: 'u1' }] });
    const sweepSpy = jest.spyOn(svc, 'runDailySweep').mockResolvedValue();
    const now = new Date(2026, 7, 7, 10, 0, 0, 0);
    jest.setSystemTime(now);
    svc.start();
    const delay = svc.computeMsUntilNext(20, now); // 10h

    jest.advanceTimersByTime(delay);

    expect(sweepSpy).toHaveBeenCalledTimes(1);
    svc.stop();
  });
});
