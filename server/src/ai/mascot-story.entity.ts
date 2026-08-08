import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, Unique } from 'typeorm';

/**
 * 吉祥物成长剧情（AI-603）。
 * 每个 (userId, level) 唯一一条：达到某等级时生成一次剧情文案，幂等复用。
 * `userId` 沿用 `ai_reports` 口径（varchar 非硬外键）。
 */
@Entity('mascot_stories')
@Unique(['userId', 'level'])
export class MascotStory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  userId: string;

  @Column({ type: 'int' })
  level: number;

  @Column({ type: 'varchar', length: 255, default: '' })
  title: string;

  @Column({ type: 'text', default: '' })
  storyText: string;

  /** true = AI 失败降级模板（不视为真实 AI 生成）。 */
  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
