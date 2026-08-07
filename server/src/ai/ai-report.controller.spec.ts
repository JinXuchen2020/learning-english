import { AiReportController } from './ai-report.controller';
import { AiReportService, DailyReportResponse } from './ai-report.service';

describe('AiReportController (POST /api/ai/report/daily)', () => {
  it('透传 userId/date 到 service 并返回响应', async () => {
    const resp: DailyReportResponse = {
      userId: 'u1',
      date: '2026-08-07',
      summaryText: 's',
      weakWords: [],
      suggestionText: 't',
      isDefault: false,
      stats: null,
    };
    const service = {
      generateDailyReport: jest.fn(async () => resp),
    } as unknown as AiReportService;
    const ctrl = new AiReportController(service);

    const res = await ctrl.daily({ userId: 'u1', date: '2026-08-07' });

    expect(service.generateDailyReport).toHaveBeenCalledWith('u1', '2026-08-07');
    expect(res).toBe(resp);
  });

  it('date 缺省时传 undefined（service 取 UTC 当日）', async () => {
    const service = {
      generateDailyReport: jest.fn(async () => ({
        userId: 'u1',
        date: '2026-08-07',
        summaryText: '默认',
        weakWords: [],
        suggestionText: '',
        isDefault: true,
        stats: null,
      })),
    } as unknown as AiReportService;
    const ctrl = new AiReportController(service);

    const res = await ctrl.daily({ userId: 'u1' });

    expect(service.generateDailyReport).toHaveBeenCalledWith('u1', undefined);
    expect(res.isDefault).toBe(true);
  });
});
