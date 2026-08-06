import {
  Entity, PrimaryGeneratedColumn, Column, Index,
} from 'typeorm';

/**
 * 句子跟读库实体（AI-309，M3 口语训练句子维度）。
 *
 * 与 `Word`（单词跟读）并列，提供预置分级跟读句供 `/speech` 页**句子模式**消费。
 * 评测时经 AI-303 `sentenceId` 路径查 `text` 作参考文本（替代此前 400 占位）。
 *
 * 设计要点（与 `Word` 同口径，避免 seed 期 uuid 耦合）：
 * - `wordTexts` 以**词汇文本字符串**关联 P0 课程词汇（如 `['cat','dog']`），
 *   满足「与课程词汇关联 / P0 单词覆盖」验收，且不依赖 Word 自动生成的 uuid。
 * - `simple-array` 在 better-sqlite3 / postgres 双驱动可移植（逗号串存储）。
 * - `level` 分级（L1/L2/L3）供 GET 过滤与后续难度自适应（AI-602）消费。
 *
 * 安全：句库为静态内容，不存儿童隐私；`lessonId` 预留课程关联扩展位（当前 seed 不填）。
 */
@Entity('sentences')
export class Sentence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 英文跟读句（评测参考文本）。 */
  @Column({ type: 'text' })
  text: string;

  /** 中文释义（前端展示）。 */
  @Column({ type: 'text' })
  meaning: string;

  /** 难度分级 L1/L2/L3（L1 最简单）。 */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'L1' })
  level: string;

  /** 关联 P0 词汇文本（小写），如 ['cat','dog']；`simple-array` 双驱动可移植。 */
  @Column({ type: 'simple-array', default: '' })
  wordTexts: string[];

  /** 主题标签（如 ['animal','greeting']），便于后续检索/推荐。 */
  @Column({ type: 'simple-array', default: '' })
  tags: string[];

  /** 预留课程/课节关联（当前 seed 不填，留扩展位）。 */
  @Column({ type: 'varchar', length: 255, nullable: true })
  lessonId: string | null;

  /** 同 level 内排序。 */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;
}
