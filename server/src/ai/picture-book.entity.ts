import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, Unique } from 'typeorm';

/**
 * AI 绘本（AI-604）。
 * 每个 (userId, courseId) 唯一一条：课程完成后按需生成一次多页故事绘本，幂等复用。
 * `userId` 沿用 `ai_reports` / `mascot_stories` 口径（varchar 非硬外键）；
 * `courseId` 为空串时表示「示例 / 默认绘本」（不绑定具体课程）。
 *
 * `pages` 以 JSON 文本存储 `PictureBookPage[]`，避免额外分表；`storyText` 保存全本
 * 正文（页文本拼接）便于单词覆盖统计与全文检索。
 */
@Entity('picture_books')
@Unique(['userId', 'courseId'])
export class PictureBook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  userId: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  courseId: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  title: string;

  @Column({ type: 'text', default: '' })
  storyText: string;

  /** JSON 数组：[{ pageNumber, text, illustrationPrompt }]。 */
  @Column({ type: 'text', default: '[]' })
  pages: string;

  @Column({ type: 'varchar', length: 512, default: '' })
  coverImagePrompt: string;

  /** true = AI 失败降级模板（不视为真实 AI 生成）。 */
  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
