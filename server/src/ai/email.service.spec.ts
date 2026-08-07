import { EmailService } from './email.service';
import { EmailSender, EmailSendOptions } from './email-sender.interface';

describe('EmailService (AI-506)', () => {
  it('sendWeeklyReport 委托底层 sender.send 并透传参数', async () => {
    const captured: EmailSendOptions[] = [];
    const fakeSender: EmailSender = {
      send: jest.fn(async (o) => {
        captured.push(o);
        return { messageId: 'm', accepted: true };
      }),
    };
    const svc = new EmailService(fakeSender);

    await svc.sendWeeklyReport({ to: 'p@x.com', subject: 's', html: '<b>h</b>', userId: 'u1', weekStart: '2026-08-03' });

    expect(fakeSender.send).toHaveBeenCalledTimes(1);
    expect(captured[0]).toEqual({
      to: 'p@x.com',
      subject: 's',
      html: '<b>h</b>',
      userId: 'u1',
      weekStart: '2026-08-03',
    });
  });
});
