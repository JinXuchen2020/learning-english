import { AiWeeklyReportController } from './ai-weekly-report.controller';
import { WeeklyReportService, WeeklyReportSendResult } from './weekly-report.service';

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
