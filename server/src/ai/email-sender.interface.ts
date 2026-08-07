/**
 * 邮件发送器抽象（AI-506）。
 *
 * 解耦「邮件内容生成 / 聚合」与「实际发送通道」：业务层（`WeeklyReportService`）
 * 只依赖 `EmailService.sendWeeklyReport`，不关心底层是落盘（开发/测试）还是真 SMTP。
 *
 * 默认实现 `LogEmailSender`（无外部依赖，把 HTML 落盘 `server/logs/emails/`），
 * 真实 SMTP 发送为环境门控扩展点（未来加 `SmtpEmailSender`，见 docs/quality/ai-506-gate.md）。
 */
export const EMAIL_SENDER_TOKEN = 'EMAIL_SENDER_TOKEN';

/** 发送选项。 */
export interface EmailSendOptions {
  /** 收件人邮箱。 */
  to: string;
  /** 邮件主题。 */
  subject: string;
  /** HTML 正文（自包含、内联样式）。 */
  html: string;
  /** 关联的儿童 userId（用于日志上下文，可选）。 */
  userId?: string;
  /** 周报起始日（用于日志上下文，可选）。 */
  weekStart?: string;
}

/** 发送结果。 */
export interface EmailSendResult {
  /** 发送器分配的消息标识（落盘场景为 `log-<时间戳>`）。 */
  messageId: string;
  /** 是否被接收方通道受理（落盘恒为 true；SMTP 视 accepted 列表）。 */
  accepted: boolean;
  /** 落盘的 HTML 文件路径（LogEmailSender 场景）；其他发送器为 undefined。 */
  htmlPath?: string;
}

/** 邮件发送器接口。 */
export interface EmailSender {
  send(opts: EmailSendOptions): Promise<EmailSendResult>;
}
