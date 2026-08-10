import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Provider 类型：开放兼容优先，bigmodel/mock 复用既有实现。 */
export type ProviderType = 'openai-compatible' | 'bigmodel' | 'mock';

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

  /** 家长账号 userId；建索引以支持按账号高效查询。 */
  @Index()
  @Column({ type: 'uuid' })
  ownerUserId: string;

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
