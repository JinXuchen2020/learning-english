import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * 家长周报邮件发送记录（AI-506，发送可追溯）。
 *
 * 每次 `WeeklyReportService.generateAndSendWeeklyReport` 调 `EmailService` 发送后，
 * 无论成功失败均落一行到 `ai_parent_email_logs`，满足验收「邮件发送成功可追溯」：
 * - 成功：status='sent' + htmlPath（LogEmailSender 落盘的 HTML 文件路径）。
 * - 失败：status='failed' + errorText（发送器抛出的原因）。
 *
 * 与 `AiReport` 同口径：`userId` 存 `varchar` **非硬外键**——审计型追加记录，
 * 不因用户删除级联清理，且避免与 `User` 实体强耦合。
 */
@Entity('ai_parent_email_logs')
export class AiParentEmailLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 周报归属儿童（来自 userId）。 */
  @Index()
  @Column({ type: 'varchar', length: 255 })
  userId: string;

  /** 实际收件人（家长邮箱）。 */
  @Column({ type: 'varchar', length: 255 })
  recipientEmail: string;

  /** 邮件主题。 */
  @Column({ type: 'text' })
  subject: string;

  /**
   * 发送结果：'sent' | 'failed'。
   * - 'sent'：邮件发送器成功受理（默认 LogEmailSender 落盘 HTML）。
   * - 'failed'：发送器抛错，errorText 记录原因。
   */
  @Column({ type: 'varchar', length: 16, default: 'sent' })
  status: 'sent' | 'failed';

  /**
   * 周报起始日 `YYYY-MM-DD`（Monday，ISO 周起始），与 `WeeklyReportService.weekStartOf` 同口径。
   * 作为同周去重 / 查询维度。
   */
  @Index()
  @Column({ type: 'varchar', length: 10 })
  weekStart: string;

  /** LogEmailSender 落盘的 HTML 文件路径（成功时）；失败为 null。 */
  @Column({ type: 'varchar', length: 512, nullable: true })
  htmlPath: string | null;

  /** 失败原因（status='failed' 时）。 */
  @Column({ type: 'text', nullable: true })
  errorText: string | null;

  /** 发送时间（TypeORM 自动维护）。 */
  @CreateDateColumn()
  createdAt: Date;
}
