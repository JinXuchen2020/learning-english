import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';

/**
 * 每用户每日 AI 配额计数（AI-107）。
 *
 * 一行 = 某用户某一天（UTC `YYYY-MM-DD`）的累计调用次数与 token 用量。
 * `(userId, date)` 唯一，保证 upsert 不重复建行。所有 AI 能力
 * （chat / 多模态 / STT / TTS / 发音评测）每次成功调用计 1 次；token 仅
 * chat/chatWithImage 上报真实用量，其余计 0。
 *
 * 与项目既有实体风格一致（`server/src/entities/*.entity.ts`）：uuid 主键、
 * varchar 存储 uuid 以兼容 sqlite/postgres 双驱动。
 */
@Entity('ai_usage')
@Unique(['userId', 'date'])
export class AiUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 用户标识（来自 JWT `sub`）。 */
  @Index()
  @Column({ type: 'varchar', length: 255 })
  userId: string;

  /** 统计日期 `YYYY-MM-DD`（UTC），作为每日行的键。 */
  @Index()
  @Column({ type: 'varchar', length: 10 })
  date: string;

  /** 当日累计成功调用次数。 */
  @Column({ type: 'int', default: 0 })
  callCount: number;

  /** 当日累计 token 用量（仅 chat 类上报）。 */
  @Column({ type: 'int', default: 0 })
  tokenCount: number;

  /** 最近一次记账时间。 */
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
