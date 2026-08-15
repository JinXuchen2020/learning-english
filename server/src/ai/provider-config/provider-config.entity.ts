import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Provider 类型：开放兼容优先（智谱/OpenAI/DeepSeek/Qwen 等均走 OpenAI 兼容通道）；bigmodel 为历史存量。'mock' 已移除（AI-713）。 */
export type ProviderType = 'openai-compatible' | 'bigmodel';

/** 能力枚举（与 AiProvider 五方法对齐，pronunciation 通用 OpenAI 不提供）。 */
export type ProviderCapability =
  | 'chat'
  | 'vision'
  | 'stt'
  | 'tts'
  | 'pronunciation';

/** 模型映射（各能力可选覆盖）。 */
export interface ProviderModels {
  chat?: string;
  vision?: string;
  tts?: string;
}

/**
 * Provider 配置实体（AI-705）。
 *
 * 按 `ownerUserId`（家长 `User.id`）隔离；apiKey 以 AES-256-GCM 密文落库，
 * 绝不存明文。同账号 `isDefault` 互斥。
 */
@Entity('provider_configs')
export class ProviderConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 家长账号 userId；系统默认行（智谱种子）为 NULL；建索引以支持按账号高效查询。 */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  ownerUserId: string | null;

  /** 展示名。 */
  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** Provider 类型。 */
  @Column({ type: 'varchar', length: 32 })
  type: ProviderType;

  /** OpenAI 兼容 base URL（mock 可空）。 */
  @Column({ type: 'varchar', length: 512, nullable: true })
  baseUrl: string | null;

  /** AES-256-GCM 密文（iv::tag::ciphertext）。apiKey 可空（如 mock）。 */
  @Column({ type: 'text', nullable: true })
  apiKeyEnc: string | null;

  /** 模型映射 JSON。 */
  @Column({ type: 'text', nullable: true })
  modelsJson: string | null;

  /** 能力数组 JSON。 */
  @Column({ type: 'text', nullable: true })
  capabilitiesJson: string | null;

  /** 同 ownerUserId 互斥的默认标记。 */
  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  /**
   * 系统级兜底排序（仅对 `ownerUserId=NULL` 的系统 provider 有意义）。
   * 主用 provider 用 `isDefault=true` 表达（排序最前）；其余系统 provider 设此值
   * 表示「主用失败时按 rank 升序兜底」。例如 Agnes(主) 失败 → 依次尝试 rank=1 的智谱。
   * 非系统 provider（家长自建）恒为 NULL。
   */
  @Column({ type: 'integer', nullable: true })
  systemFallbackRank?: number | null;

  /**
   * 透传给 provider 的额外请求体 JSON（如 OpenAI 兼容的 `chat_template_kwargs`
   * / `enable_thinking`）。构建运行时 provider 时合并进 chat 请求体，绝不存明文密钥。
   */
  @Column({ type: 'text', nullable: true })
  extraJson?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
