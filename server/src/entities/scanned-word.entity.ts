import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/** 拍照识词生词本条目状态。 */
export type ScannedWordStatus = 'pending' | 'saved';

/**
 * 拍照识词生成的个人生词本条目（AI-606）。
 *
 * 不复用 `words`（`Word` 强依赖 `lessonId` + 测验字段），也不复用 `ai_word_cards`
 * （全局待审内容库）；OCR 生词本是**按用户**的个人收藏，故独立实体。
 *
 * @module entities/scanned-word
 */
@Entity('scanned_words')
export class ScannedWord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所属用户 id（NOT NULL，越权防护依据）。 */
  @Column({ type: 'varchar' })
  userId: string;

  /** 英文单词。 */
  @Column()
  wordText: string;

  /** 中文释义。 */
  @Column()
  meaning: string;

  /** 英文例句（可选）。 */
  @Column({ type: 'varchar', nullable: true })
  example: string | null;

  /** 配图生成 prompt（可选，供后续文生图）。 */
  @Column({ type: 'varchar', nullable: true })
  imagePrompt: string | null;

  /** 状态：识别后 pending，用户「加入生词本」后 saved。 */
  @Column({ type: 'varchar', default: 'pending' })
  status: ScannedWordStatus;

  @CreateDateColumn()
  createdAt: Date;
}
