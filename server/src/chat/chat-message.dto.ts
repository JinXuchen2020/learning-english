import { IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';

/**
 * `POST /api/ai/chat/messages` 请求体（AI-403）。
 *
 * 全局 `ValidationPipe(whitelist+transform+forbidNonWhitelisted)` 生效：
 * 仅下列字段允许，未知字段被拒（400）。
 *
 * 鉴权 deferred（与本项目全部 AI 接口口径一致）：userId 缺省 `anonymous`，
 * 待统一鉴权 feature 接入后切换解析器。
 */
export class ChatMessageDto {
  /** 宝宝发言（必填，非空，截断上限 2000 字符）。 */
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;

  /**
   * 续聊会话 id（可选）。提供则复用既有会话（不存在 → 404）；
   * 不提供则新建会话。对应 `ai_chat_sessions.id`（uuid）。
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sessionId?: string;

  /**
   * 场景包 id（可选，≤64 字符，对应 `ai_chat_sessions.sceneId`）。
   * 仅新建会话时写入；续聊时忽略（以会话本身 sceneId 为准）。
   * 已知场景：greeting / zoo / shopping / weather / body；自由对话可空。
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sceneId?: string;

  /**
   * 归属用户 id（可选）。不提供 → `anonymous` 占位（与 AI-108 审计默认、
   * 评测 DTO 口径一致），写入会话 userId（varchar 引用，非硬外键）。
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  userId?: string;
}
