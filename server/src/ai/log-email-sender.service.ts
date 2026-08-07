import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { EmailSendOptions, EmailSendResult, EmailSender } from './email-sender.interface';
import { logger } from '../common/logger/logger';

/**
 * 邮件发送器：落盘实现（AI-506 默认）。
 *
 * 把 HTML 正文写入 `server/logs/emails/<ISO时间戳>-<sanitized-to>.html`，
 * 返回 `{ messageId: 'log-<ts>', accepted: true, htmlPath }`。
 *
 * 设计取舍（与 AI-505 不引入 `@nestjs/schedule` 同取向）：
 * - **零外部依赖**：不接入 SMTP，CI / 单测 / 离线均可跑，且发送结果可文件级断言。
 * - **可追溯**：落盘路径回写 `AiParentEmailLog.htmlPath`，家长可在邮件目录复核。
 * - 真实 SMTP 为扩展点：实现 `EmailSender` 接口、在 `AiModule` 用
 *   `{ provide: EMAIL_SENDER_TOKEN, useClass: SmtpEmailSender }` 一行切换即可。
 *
 * 落盘目录可用 `EMAIL_LOG_DIR` 覆盖（测试时指向临时目录，避免污染仓库日志）。
 */
@Injectable()
export class LogEmailSender implements EmailSender {
  private readonly dir: string;

  constructor() {
    this.dir = process.env.EMAIL_LOG_DIR || path.join(process.cwd(), 'server', 'logs', 'emails');
  }

  async send(opts: EmailSendOptions): Promise<EmailSendResult> {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const safeTo = (opts.to || 'unknown').replace(/[^a-zA-Z0-9._@-]/g, '_');
    const file = path.join(this.dir, `${ts}-${safeTo}.html`);
    await fs.promises.mkdir(this.dir, { recursive: true });
    await fs.promises.writeFile(file, opts.html, 'utf8');
    logger.info(`[AI-506] 周报邮件已落盘（模拟发送）→ ${file} → ${opts.to}`);
    return {
      messageId: `log-${ts}`,
      accepted: true,
      htmlPath: file,
    };
  }
}
