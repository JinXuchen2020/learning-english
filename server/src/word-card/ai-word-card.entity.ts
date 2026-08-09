import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/** 单词卡片审核状态。 */
export type WordCardStatus = 'pending' | 'approved' | 'rejected';

/**
 * AI 生成的单词卡片（待审表，AI-601）。
 *
 * 选择「待审表」而非直接落 `words`：`Word` 实体强依赖 `lessonId` 与测验字段
 * （options/correctIndex），独立生成的单词卡不便挂载；落本表更贴合「审核后入库」
 * 语义，且避免污染正式词库。`status` 由审核动作流转 pending → approved/rejected。
 *
 * @module word-card/ai-word-card.entity
 */
@Entity('ai_word_cards')
export class AiWordCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 英文单词。 */
  @Column()
  wordText: string;

  /** 中文释义。 */
  @Column()
  meaning: string;

  /** 英文例句。 */
  @Column()
  example: string;

  /** 例句中文翻译（可选）。 */
  @Column({ type: 'varchar', nullable: true })
  exampleTrans: string | null;

  /** 配图生成 prompt（英文，供后续文生图使用）。 */
  @Column()
  imagePrompt: string;

  /** 生成所用兴趣 / 主题（保留来源，便于审核判断相关性）。 */
  @Column()
  interest: string;

  /** 关联课程 id（可选，来自请求）。 */
  @Column({ type: 'varchar', nullable: true })
  courseId: string | null;

  /** 审核状态，默认 pending。 */
  @Column({ type: 'varchar', default: 'pending' })
  status: WordCardStatus;

  /** 审核备注（家长 / 自动审核填写）。 */
  @Column({ type: 'varchar', nullable: true })
  reviewerNote: string | null;

  @CreateDateColumn()
  createdAt: Date;

  /** 批准时间（驳回为 null）。 */
  @Column({ type: 'datetime', nullable: true })
  approvedAt: Date | null;
}
