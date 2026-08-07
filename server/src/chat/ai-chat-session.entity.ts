import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * AI 对话陪练会话实体（AI-401，M4 对话陪练起点）。
 *
 * 一次「场景对话」对应一条 session；session 归属某 child 用户（userId）与
 * 某个场景包（sceneId，AI-405 定义），并累计本会话获得的星星（stars，AI-408 写入）。
 *
 * 与 `AiSpeechAttempt` / `AiCallLog` / `AiUsage` 同口径：`userId` 存 `varchar`
 * **非硬外键**——本表是用户追加的 AI 交互审计记录，不因用户删除而级联清理，
 * 且避免与 `User` 实体强耦合；`sceneId` 同理仅存场景包字符串 id（AI-405 为
 * 配置式场景包，非实体）。「关联 User」以 varchar 引用实现，与 AI-301 一致。
 */
@Entity('ai_chat_sessions')
export class AiChatSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 会话归属 child 用户（来自请求上下文解析的 userId）。 */
  @Index()
  @Column({ type: 'varchar', length: 255 })
  userId: string;

  /** 场景包 id（AI-405 定义，如 'greeting'/'zoo'/'shopping'/'weather'/'body'）；自由对话可为 null。 */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  sceneId: string | null;

  /** 本会话累计星星数（AI-408 完成 N 轮后 +1），默认 0。 */
  @Column({ type: 'int', default: 0 })
  stars: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true })
  updatedAt: Date | null;
}
