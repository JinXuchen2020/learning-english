import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * AI 对话陪练消息实体（AI-401，M4 对话陪练起点）。
 *
 * 一条 session 下可有 N 条 message（user / assistant / system 轮次）；
 * `sessionId` 以 varchar 引用（与 `AiSpeechAttempt.wordId/sentenceId` 同口径，非硬外键，
 * 避免 ChatModule 与自身级联耦合，且会话删除非关键路径）；`audioPath` 存 assistant
 * TTS 音频路径（AI-402 生成，AI-407 自动播放），user/system 消息为 null。
 *
 * 消息不可变，仅 `createdAt` 排序，无 `updatedAt`。
 */
@Entity('ai_chat_messages')
export class AiChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 归属会话 id（varchar 引用，非硬外键）。 */
  @Index()
  @Column({ type: 'varchar', length: 255 })
  sessionId: string;

  /** 消息角色：user / assistant / system（与 OpenAI 角色约定一致）。 */
  @Column({ type: 'varchar', length: 16 })
  role: ChatMessageRole;

  /** 消息正文。 */
  @Column({ type: 'text' })
  text: string;

  /** assistant 语音条音频路径（AI-402 TTS 产出，AI-407 播放）；非语音消息为 null。 */
  @Column({ type: 'varchar', length: 512, nullable: true })
  audioPath: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

/** 聊天消息角色（与 OpenAI 角色约定一致）。 */
export type ChatMessageRole = 'user' | 'assistant' | 'system';

/** 合法角色枚举（双驱动可移植，varchar 存储）。 */
export const CHAT_MESSAGE_ROLES: readonly ChatMessageRole[] = [
  'user',
  'assistant',
  'system',
];
