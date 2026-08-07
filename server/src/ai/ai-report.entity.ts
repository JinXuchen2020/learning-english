import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Unique } from 'typeorm';

/**
 * 每日 AI 学习报告实体（AI-501，M5 报告起点）。
 *
 * 每个儿童每一天的 AI 学习小结落一行到 `ai_reports` 表，供
 * AI-502（聚合接口）/ AI-504（Home「今日 AI 小结」卡片）/ AI-506（家长周报）消费。
 *
 * 与 `AiUsage`（AI-107）同口径：`userId` 存 `varchar` **非硬外键**——本表是
 * 审计型追加记录，不因用户删除而级联清理，且避免与 `User` 实体强耦合。
 *
 * `(userId, date)` 组合唯一：保证 AI-502 同日重复生成时命中唯一约束、
 * 由业务层捕获并返回已有报告，实现生成幂等（与 `AiUsage` 的每日配额行同设计）。
 *
 * 安全：本表只存小结文本与弱项单词清单，不存儿童原始音频/答题内容。
 */
@Entity('ai_reports')
@Unique(['userId', 'date'])
export class AiReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 报告归属儿童（来自 JWT `sub`）。 */
  @Index()
  @Column({ type: 'varchar', length: 255 })
  userId: string;

  /**
   * 报告日期 `YYYY-MM-DD`（本地日），与 `AiUsage.date` 口径一致，作为每日行的键。
   * 与 `userId` 组成唯一约束，同日重复生成返回已有报告。
   */
  @Index()
  @Column({ type: 'varchar', length: 10 })
  date: string;

  /** 鼓励语气的总体小结（AI-503 ReportAgent 输出），可含当日掌握亮点。 */
  @Column({ type: 'text', default: '' })
  summaryText: string;

  /**
   * 弱项单词清单（如 `['apple','banana']`）。
   * 采用 `simple-array` 而非 `json`：项目 `better-sqlite3` 驱动无 `json` 列先例，
   * `simple-array` 在 sqlite/postgres 双驱动可移植，与 `AiSpeechAttempt.weakPhonemes`
   * / `Sentence` 同口径；结构化弱项详情（释义/错因）保留在 AI-502/503 的 DTO/agent 层。
   */
  @Column({ type: 'simple-array', default: '' })
  weakWords: string[];

  /** 给儿童的明日建议（AI-503 输出），默认空串。 */
  @Column({ type: 'text', default: '' })
  suggestionText: string;

  /**
   * 是否为「无学习数据」的友好默认报告（AI-502）。
   * - `true`：当日无活动，业务层未调 AI 直接落库的鼓励型默认（同日幂等复用）。
   * - `false`：由 ReportAgent 真实聚合生成，或 AI 失败降级时的占位（前端不再展示 encourage 态）。
   * 持久化该标志，保证幂等读回时如实返回，前端据此区分「默认鼓励」与「真实小结」。
   */
  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  /** 报告生成时间（TypeORM 自动维护，sqlite→datetime / postgres→timestamptz）。 */
  @CreateDateColumn()
  createdAt: Date;
}
