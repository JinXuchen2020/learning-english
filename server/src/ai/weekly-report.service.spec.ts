import { WeeklyReportService, WeeklyReportData } from './weekly-report.service';
import { AiReportService, DailyReportStats } from './ai-report.service';
import { EmailService } from './email.service';
import { AiReport } from './ai-report.entity';

function zeroStats(date: string): DailyReportStats {
  return {
    date,
    taskComplete: 0,
    wordsPracticed: 0,
    lessonsCompleted: 0,
    speechAttempts: 0,
    avgSpeechScore: null,
    weakWordCandidates: [],
  };
}

/** 构造 WeeklyReportService（直接 new，注入全部依赖的 mock）。 */
function makeService(overrides: {
  user?: any;
  reports?: Partial<AiReport>[];
  getDailyStats?: (userId: string, date: string) => DailyReportStats;
  send?: any;
  saveLog?: any;
} = {}) {
  const userRepo: any = {
    findOne: jest.fn(async () => overrides.user ?? null),
  };
  const reportRepo: any = {
    find: jest.fn(async () => overrides.reports ?? []),
  };
  const emailLogRepo: any = {
    create: jest.fn((e) => e),
    save:
      overrides.saveLog ||
      jest.fn(async (e) => ({ ...e, id: 'log-1' })),
  };
  const aiReportService: AiReportService = {
    getDailyStats:
      overrides.getDailyStats ||
      jest.fn(async (_, date) => zeroStats(date)),
  } as unknown as AiReportService;
  const emailService: EmailService = {
    sendWeeklyReport:
      overrides.      send ||
      jest.fn<any, any[]>(async () => ({ messageId: 'log-x', accepted: true, htmlPath: '/tmp/x.html' })),
  } as unknown as EmailService;

  const svc = new WeeklyReportService(userRepo, reportRepo, emailLogRepo, aiReportService, emailService);
  return { svc, userRepo, reportRepo, emailLogRepo, aiReportService, emailService };
}

describe('WeeklyReportService.weekStartOf (AI-506)', () => {
  it('返回 date 所在周的 Monday（2026-08-07 周五 → 2026-08-03 周一）', () => {
    const { svc } = makeService();
    expect(svc.weekStartOf('2026-08-07')).toBe('2026-08-03');
  });

  it('Monday 自身即返回自身', () => {
    const { svc } = makeService();
    expect(svc.weekStartOf('2026-08-03')).toBe('2026-08-03');
  });

  it('Sunday 返回本周周一（非下周）', () => {
    const { svc } = makeService();
    expect(svc.weekStartOf('2026-08-09')).toBe('2026-08-03');
  });
});

describe('WeeklyReportService.buildWeeklyReport (AI-506)', () => {
  const WS = '2026-08-03';
  const statsByDate: Record<string, DailyReportStats> = {
    '2026-08-03': { date: '2026-08-03', taskComplete: 2, wordsPracticed: 3, lessonsCompleted: 1, speechAttempts: 2, avgSpeechScore: 80, weakWordCandidates: ['apple', 'banana'] },
    '2026-08-04': { date: '2026-08-04', taskComplete: 1, wordsPracticed: 2, lessonsCompleted: 0, speechAttempts: 1, avgSpeechScore: 70, weakWordCandidates: ['apple'] },
    '2026-08-05': { date: '2026-08-05', taskComplete: 0, wordsPracticed: 0, lessonsCompleted: 0, speechAttempts: 0, avgSpeechScore: null, weakWordCandidates: [] },
    '2026-08-06': { date: '2026-08-06', taskComplete: 3, wordsPracticed: 1, lessonsCompleted: 2, speechAttempts: 0, avgSpeechScore: null, weakWordCandidates: ['cat'] },
    '2026-08-07': { ...zeroStats('2026-08-07') },
    '2026-08-08': { ...zeroStats('2026-08-08') },
    '2026-08-09': { ...zeroStats('2026-08-09') },
  };

  it('聚合 7 日指标：活跃天数 / 任务 / 单词 / 课程 / 口语 / 平均分', async () => {
    const { svc } = makeService({
      user: { id: 'u1', nickname: '小明', parentEmail: 'p@x.com' },
      getDailyStats: (_userId, date) => statsByDate[date],
      reports: [
        { date: '2026-08-03', summaryText: '今天很棒', suggestionText: '明天练发音', isDefault: false } as AiReport,
        { date: '2026-08-04', summaryText: '继续加油', suggestionText: '', isDefault: false } as AiReport,
      ],
    });

    const data: WeeklyReportData = await svc.buildWeeklyReport('u1', WS);

    expect(data.weekStart).toBe(WS);
    expect(data.weekEnd).toBe('2026-08-09');
    expect(data.metrics.activeDays).toBe(3); // 03/04/06 有活动
    expect(data.metrics.totalTasksCompleted).toBe(6);
    expect(data.metrics.totalWordsPracticed).toBe(6);
    expect(data.metrics.totalLessonsCompleted).toBe(3);
    expect(data.metrics.totalSpeechAttempts).toBe(3);
    expect(data.metrics.avgSpeechScore).toBe(75); // (80+70)/2 四舍五入
    expect(data.weakWordsTop[0]).toBe('apple'); // 出现 2 次，频次最高
    expect(data.weakWordsTop).toEqual(['apple', 'banana', 'cat']);
    expect(data.masteryTrend).toHaveLength(7);
    expect(data.dailySummaries).toHaveLength(2);
    expect(data.suggestions).toEqual(['明天练发音']);
    expect(data.html).toContain('小明');
    expect(data.html).toContain(WS);
  });

  it('单日 getDailyStats 抛错不致命（视该日为 0 活动）', async () => {
    const { svc } = makeService({
      user: { id: 'u1', nickname: '小明', parentEmail: 'p@x.com' },
      getDailyStats: (_userId, date) => {
        if (date === '2026-08-05') throw new Error('db boom');
        return statsByDate[date];
      },
    });
    const data = await svc.buildWeeklyReport('u1', WS);
    expect(data.metrics.activeDays).toBe(3);
    expect(data.metrics.avgSpeechScore).toBe(75);
  });
});

describe('WeeklyReportService.generateAndSendWeeklyReport (AI-506)', () => {
  const WS = '2026-08-03';

  it('有 parentEmail → 发信 + 落 AiParentEmailLog(sent)', async () => {
    const saveLog = jest.fn(async (e) => ({ ...e, id: 'log-9' }));
    const send = jest.fn<any, any[]>(async () => ({ messageId: 'log-msg', accepted: true, htmlPath: '/tmp/w.html' }));
    const { svc, emailService } = makeService({
      user: { id: 'u1', nickname: '小明', parentEmail: 'parent@x.com' },
      send,
      saveLog,
    });

    const res = await svc.generateAndSendWeeklyReport('u1');

    expect(emailService.sendWeeklyReport).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe('parent@x.com');
    expect(send.mock.calls[0][0].subject).toContain('小明');
    expect(saveLog).toHaveBeenCalledTimes(1);
    expect(saveLog.mock.calls[0][0].status).toBe('sent');
    expect(saveLog.mock.calls[0][0].htmlPath).toBe('/tmp/w.html');
    expect(res).toEqual({
      success: true,
      recipientEmail: 'parent@x.com',
      weekStart: WS,
      emailLogId: 'log-9',
      messageId: 'log-msg',
    });
  });

  it('有 recipientEmail 覆盖 → 用覆盖值发信', async () => {
    const send = jest.fn<any, any[]>(async () => ({ messageId: 'm', accepted: true, htmlPath: '/t.html' }));
    const { svc } = makeService({
      user: { id: 'u1', nickname: '小明', parentEmail: 'default@x.com' },
      send,
    });
    const res = await svc.generateAndSendWeeklyReport('u1', { recipientEmail: 'override@x.com' });
    expect(send.mock.calls[0][0].to).toBe('override@x.com');
    expect((res as any).success).toBe(true);
  });

  it('无 parentEmail 且无覆盖 → 跳过（skipped:no-recipient）', async () => {
    const send = jest.fn();
    const { svc } = makeService({ user: { id: 'u1', nickname: '小明', parentEmail: null }, send });
    const res = await svc.generateAndSendWeeklyReport('u1');
    expect(send).not.toHaveBeenCalled();
    expect(res).toEqual({ skipped: true, reason: 'no-recipient', weekStart: WS });
  });

  it('用户不存在 → 跳过（skipped:user-not-found）', async () => {
    const { svc } = makeService({ user: null });
    const res = await svc.generateAndSendWeeklyReport('u1');
    expect(res).toEqual({ skipped: true, reason: 'user-not-found' });
  });

  it('发信失败 → 落 AiParentEmailLog(failed) 且不向上抛，返回 success:false', async () => {
    const saveLog = jest.fn(async (e) => ({ ...e, id: 'log-err' }));
    const send = jest.fn<any, any[]>(async () => {
      throw new Error('SMTP down');
    });
    const { svc } = makeService({
      user: { id: 'u1', nickname: '小明', parentEmail: 'p@x.com' },
      send,
      saveLog,
    });
    const res = await svc.generateAndSendWeeklyReport('u1');
    expect(saveLog).toHaveBeenCalledTimes(1);
    expect(saveLog.mock.calls[0][0].status).toBe('failed');
    expect(saveLog.mock.calls[0][0].errorText).toContain('SMTP down');
    expect((res as any).success).toBe(false);
  });
});
