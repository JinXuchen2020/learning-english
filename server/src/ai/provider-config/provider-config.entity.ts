import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Provider 类型：统一走 OpenAI 兼容通道（智谱/OpenAI/DeepSeek/Qwen/Agnes 等均复用 /chat/completions、/audio/* 形状）。'mock' 与历史 'bigmodel' 通道已移除（AI-713 / AI-重构）。 */
export type ProviderType = 'openai-compatible';

/** 能力枚举（与 AiProvider 五方法对齐，pronunciation 通用 OpenAI 不提供）。 */
export type ProviderCapability =
  | 'chat'
  | 'vision'
  | 'stt'
  | 'tts'
  | 'pronunciation';

/**
 * Provider 配置实体（AI-705 / AI-714）。
 *
 * AI-714 变更：移除 `modelsJson`（多模型映射），改为单一必填 `model` 字段——
 * 一个 provider 配置对应一个模型，能力（chat/vision/stt/tts/pronunciation）由该
 * 模型实际支持情况决定，保存时按 `model` 真验证。
 *
 * 按 `ownerUserId`（家长 `User.id`）隔离；apiKey 以 AES-256-GCM 密文落库，
 * 绝不存明文。同账号 `isDefault` 互斥。
 */
@Entity('provider_configs')
export class ProviderConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 家长账号 userId；系统默认行（如 Agnes AI 种子）为 NULL；建索引以支持按账号高效查询。 */
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

  /**
   * 模型名称。能力验证基于此模型真发请求（如 gpt-4o / tts-1 / whisper-1）。
   * AI-714 起为单一模型字段，替代旧的 modelsJson 多模型映射。
   * 经 DTO 新建/修改的 provider 必填（class-validator 强制），缺省由
   * `buildProvider` 回退默认模型。DB 列保留 nullable 以兼容 `synchronize`
   * 对历史行（旧 seed/测试数据）的零停机迁移；TS 侧按非空 `string` 处理
   * （新建行恒有 model，旧 null 行由运行时回退兜底，不会传入必填契约）。
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  model: string;

  /** 能力数组 JSON。 */
  @Column({ type: 'text', nullable: true })
  capabilitiesJson: string | null;

  /** 同 ownerUserId 互斥的默认标记。 */
  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  /**
   * 系统级兜底排序（仅对 `ownerUserId=NULL` 的系统 provider 有意义）。
   * 主用 provider 用 `isDefault=true` 表达（排序最前）；其余系统 provider 设此值
   * 表示「主用失败时按 rank 升序兜底」（历史多候选链，AI-重构后默认仅保留单一系统默认，
   * 该字段一般留 NULL，由 `resolveConfigForCapability` 走「家长配置 → 系统默认 → Mock」）。
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
