import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_SENDER_TOKEN, EmailSendOptions, EmailSendResult, EmailSender } from './email-sender.interface';

/**
 * 邮件服务（AI-506）。
 *
 * 业务层入口：把「周报邮件」语义（`sendWeeklyReport`）包装在通用 `EmailSender` 之上。
 * 实际发送通道由 `EMAIL_SENDER_TOKEN` 注入（默认 `LogEmailSender`）。
 *
 * 本服务**只负责发送**，不持久化发送记录——发送日志（`AiParentEmailLog`）由
 * `WeeklyReportService` 持有实体仓库并落库，保证「内容生成 / 发信 / 可追溯」职责分离。
 */
@Injectable()
export class EmailService {
  constructor(@Inject(EMAIL_SENDER_TOKEN) private readonly sender: EmailSender) {}

  /** 发送家长周报邮件（委托底层发送器）。 */
  sendWeeklyReport(opts: EmailSendOptions): Promise<EmailSendResult> {
    return this.sender.send(opts);
  }
}
