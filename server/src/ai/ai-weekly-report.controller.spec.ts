import { AiWeeklyReportController } from './ai-weekly-report.controller';
import { WeeklyReportService, WeeklyReportSendResult, WeeklyReportData } from './weekly-report.service';
import { BadRequestException } from '@nestjs/common';

describe('AiWeeklyReportController (POST /api/ai/report/weekly)', () => {
  it('透传 dto 到 service 并返回发送结果', async () => {
    const res: WeeklyReportSendResult = {
      success: true,
      recipientEmail: 'p@x.com',
      weekStart: '2026-08-03',
      emailLogId: 'log-1',
      messageId: 'm',
    };
    const service = {
      generateAndSendWeeklyReport: jest.fn(async () => res),
    } as unknown as WeeklyReportService;
    const ctrl = new AiWeeklyReportController(service);

    const out = await ctrl.weekly({ userId: 'u1', weekStart: '2026-08-03', recipientEmail: 'p@x.com' });

    expect(service.generateAndSendWeeklyReport).toHaveBeenCalledWith('u1', {
      weekStart: '2026-08-03',
      recipientEmail: 'p@x.com',
    });
    expect(out).toBe(res);
  });

  it('跳过结果也原样透传', async () => {
    const res: WeeklyReportSendResult = { skipped: true, reason: 'no-recipient', weekStart: '2026-08-03' };
    const service = {
      generateAndSendWeeklyReport: jest.fn(async () => res),
    } as unknown as WeeklyReportService;
    const ctrl = new AiWeeklyReportController(service);

    const out = await ctrl.weekly({ userId: 'u1' });
    expect(service.generateAndSendWeeklyReport).toHaveBeenCalledWith('u1', {
      weekStart: undefined,
      recipientEmail: undefined,
    });
    expect(out).toBe(res);
  });
});

describe('AiWeeklyReportController (GET /api/ai/report/weekly/preview, AI-507)', () => {
  it('透传 userId/weekStart 到 buildWeeklyReport 并返回聚合数据（不发送邮件）', async () => {
    const data: WeeklyReportData = {
      userId: 'u1',
      childName: '小明',
      weekStart: '2026-08-03',
      weekEnd: '2026-08-09',
      metrics: {
        activeDays: 3,
        totalTasksCompleted: 5,
        totalWordsPracticed: 10,
        totalLessonsCompleted: 2,
        totalSpeechAttempts: 4,
        avgSpeechScore: 80,
      },
      weakWordsTop: ['apple', 'banana'],
      masteryTrend: [],
      dailySummaries: [],
      suggestions: [],
      html: '',
    };
    const service = {
      buildWeeklyReport: jest.fn(async () => data),
    } as unknown as WeeklyReportService;
    const ctrl = new AiWeeklyReportController(service);

    const out = await ctrl.preview('u1', '2026-08-03');
    expect(service.buildWeeklyReport).toHaveBeenCalledWith('u1', '2026-08-03');
    expect(out).toBe(data);
  });

  it('缺 userId 抛 BadRequestException', async () => {
    const service = {
      buildWeeklyReport: jest.fn(),
    } as unknown as WeeklyReportService;
    const ctrl = new AiWeeklyReportController(service);

    await expect(ctrl.preview('', undefined)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.buildWeeklyReport).not.toHaveBeenCalled();
  });
});
