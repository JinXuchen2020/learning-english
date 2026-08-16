import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * AI 调用审计日志实体（AI-108）。
 *
 * 每次 LLM 调用（无论成功/失败/被配额拦截）落一条记录到 `ai_call_logs` 表，
 * 便于按 用户 / 模块 / 日 聚合做成本审计与线上排查。
 *
 * 与 `AiUsage`（AI-107 每日配额计数）不同：本表是**不可变审计流水**，不用于
 * 实时限流判定，仅 append，故不做唯一约束。
 *
 * 安全：所有文本字段（`errorMessage` / `requestSnippet` / `responseSnippet`）
 * 均为截断后的摘要，不存儿童原始音频/长文本。
 */
@Entity('ai_call_logs')
export class AiCallLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 调用归属用户（来自 USER_ID_RESOLVER_TOKEN，无控制器时默认 'anonymous'）。 */
  @Column({ type: 'varchar', length: 64, default: 'anonymous' })
  userId: string;

  /** 实际 provider 标识（链构成，如 `Agnes AI → 智谱 GLM (系统默认)`）；AI-713 后携带真实名以区分各 provider。 */
  @Column({ type: 'varchar', length: 64 })
  provider: string;

  /** 调用方法名（chat / chatWithImage / transcribe / assessPronunciation / synthesize）。 */
  @Column({ type: 'varchar', length: 32 })
  operation: string;

  /** 业务模块标签（plan / speech / chat / report；无控制器时默认 'global'）。 */
  @Column({ type: 'varchar', length: 32, default: 'global' })
  moduleTag: string;

  @Column({ type: 'int', default: 0 })
  promptTokens: number;

  @Column({ type: 'int', default: 0 })
  completionTokens: number;

  @Column({ type: 'int', default: 0 })
  totalTokens: number;

  /** 本次调用（含重试）总耗时，毫秒。 */
  @Column({ type: 'int', default: 0 })
  durationMs: number;

  /** 调用结果：'ok' 成功 / 'error' 失败或拦截。 */
  @Column({ type: 'varchar', length: 16 })
  status: 'ok' | 'error';

  /** 失败原因摘要（已截断，最长 255 + 省略号 = 256 字符）；成功为 null。用 TEXT 容纳截断后内容。 */
  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  /** 失败堆栈（深度排查用，TEXT 存全文，截断到 4000 字符）；成功为 null。 */
  @Column({ type: 'text', nullable: true })
  errorStack: string | null;

  /** 请求摘要（已截断，敏感内容不写全量）；成功/失败均记录。 */
  @Column({ type: 'text', nullable: true })
  requestSnippet: string | null;

  /** 响应摘要（已截断）；失败为 null。 */
  @Column({ type: 'text', nullable: true })
  responseSnippet: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

/** 写入 `AiCallLog` 的入参（不含自动字段 id/createdAt）。 */
export interface AiCallLogEntry {
  userId: string;
  provider: string;
  operation: string;
  moduleTag: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs: number;
  status: 'ok' | 'error';
  errorMessage?: string | null;
  errorStack?: string | null;
  requestSnippet?: string | null;
  responseSnippet?: string | null;
}
