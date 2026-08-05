import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * 口语跟读尝试实体（AI-301，M3 口语训练起点）。
 *
 * 每次孩子跟读（单词/句子）落一条记录到 `ai_speech_attempts` 表，供
 * AI-306（评分反馈）/ AI-307（跟读卡片历史）/ AI-602（难度自适应）消费。
 *
 * 与 `AiCallLog`（AI-108）同口径：`userId` 存 `varchar` **非硬外键**——本表是
 * 审计型追加记录，不因用户删除而级联清理，且避免与 `User` 实体强耦合；
 * `wordId` / `sentenceId` 同理仅存引用字符串（单词/句子模式二选一填空），
 * 弱项完整性由 AI-306 业务层保证。
 *
 * 安全：本表只存评分与弱音素标签，不存儿童原始音频内容（音频走 `audioPath` 文件）。
 */
@Entity('ai_speech_attempts')
export class AiSpeechAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 尝试归属用户（来自请求上下文解析的 userId）。 */
  @Index()
  @Column({ type: 'varchar', length: 255 })
  userId: string;

  /** 单词跟读时的单词 id（单词模式）；句子模式为 null。 */
  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  wordId: string | null;

  /** 句子跟读时的句子 id（句子模式，AI-309 句库）；单词模式为 null。 */
  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  sentenceId: string | null;

  /** 录音文件路径（AI-302 落盘，相对或绝对路径）。 */
  @Column({ type: 'varchar', length: 512 })
  audioPath: string;

  /** 发音评分 0-100（AI-305/306 写入；落库层经 `clampScore` 兜底钳制）。 */
  @Column({ type: 'int', default: 0 })
  score: number;

  /** 弱音素列表（phoneme 级），如 ['θ','ʃ']；`simple-array` 双驱动可移植。 */
  @Column({ type: 'simple-array', default: '' })
  weakPhonemes: string[];

  @CreateDateColumn()
  createdAt: Date;
}

/** 写入 `AiSpeechAttempt` 的入参（不含自动字段 id/createdAt）。 */
export interface AiSpeechAttemptEntry {
  userId: string;
  wordId?: string | null;
  sentenceId?: string | null;
  audioPath: string;
  /** 发音评分（可为越界/小数，落库层经 `clampScore` 钳制）。 */
  score: number;
  /** 弱音素列表（可空/含空白，落库层经 `sanitizePhonemes` 清洗）。 */
  weakPhonemes?: string[] | null;
}

/**
 * 把任意评分钳制到合法区间 [0,100] 并取整。
 * - 非有限数（NaN/Infinity/undefined）→ 0
 * - <0 → 0；>100 → 100；其余四舍五入取整
 * 作为落库兜底，即便上游（AI-305/306）已约束评分，仍防越界脏数据。
 */
export function clampScore(score: number): number {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 0;
  if (score < 0) return 0;
  if (score > 100) return 100;
  return Math.round(score);
}

/**
 * 清洗弱音素列表：null/undefined/空数组 → 空数组；
 * 其余逐项 trim 并过滤掉空串（防脏数据把 '  ' 当弱音素存库）。
 */
export function sanitizePhonemes(phonemes?: string[] | null): string[] {
  if (!phonemes || phonemes.length === 0) return [];
  return phonemes.map((p) => String(p).trim()).filter((p) => p.length > 0);
}
