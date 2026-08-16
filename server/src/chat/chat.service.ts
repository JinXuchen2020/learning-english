/**
 * ChatService — 对话陪练聊天编排（AI-403）
 *
 * 接收宝宝发言，结合会话历史 + 场景系统提示调用 LLM 生成回复，
 * 落库 `ai_chat_sessions` / `ai_chat_messages`，并用 AI-402 的 TTS 能力
 * 产出狐狸音色朗读音频引用，一并返回。
 *
 * 设计要点：
 * - 底层 `provider`（经 AI-106「重试+配额+日志」链）通过全局 `AiModule` 的
 *   `AI_PROVIDER_TOKEN` 注入，本服务不绑定具体厂商。
 * - LLM 失败（provider 抛带 `statusCode` 的异常）映射为 {@link ChatError}，
 *   由 controller 翻译为对应 HTTP 状态码；不抛未处理异常。
 * - TTS 失败**不阻断**文本回复：降级返回 `ttsUrl=null`（前端退化为浏览器 TTS
 *   或仅文本），与本项目「降级仅标记不阻断」口径一致。
 * - 会话 userId 默认 `anonymous`（鉴权 deferred，与 AI-108/评测 DTO 一致）；
 *   `sceneId` 仅新建会话时写入，续聊忽略。
 *
 * @module chat/chat.service
 */

import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AI_PROVIDER_TOKEN,
  AiProvider,
  ChatMessage,
  ChatResult,
  AudioResult,
} from '../ai/ai-provider.interface';
import { AiChatSession } from './ai-chat-session.entity';
import { AiChatMessage } from './ai-chat-message.entity';
import { ChatMessageDto } from './chat-message.dto';
import { ChatError } from './chat.errors';
import { buildChatSystemPrompt } from './chat-system-prompt';
import { ChatSafetyService } from './chat-safety.service';
import { SAFE_FALLBACK_REPLY } from './chat-safety.config';
import { stripMetaMarkers } from './chat-text.util';
import { computeStars, type StarAward } from './chat-stars';
import {
  buildSessionSummaries,
  toHistoryMessage,
  type ChatSessionSummary,
  type ChatHistoryMessage,
} from './chat-sessions';
import { logger } from '../common/logger/logger';

/** 聊天响应（与前端 AI-407 契约一致，AI-408 追加 stars 字段）。 */
export interface ChatSendResponse {
  /** 本次会话 id（新建或复用）。 */
  sessionId: string;
  /** 助手回复消息 id。 */
  messageId: string;
  /** LLM 生成的狐狸回复正文。 */
  replyText: string;
  /** 狐狸朗读音频的可播放引用（URL 或 data URI）；无音频为 null。 */
  ttsUrl: string | null;
  /** 本会话累计星星数（AI-408，完成 N 轮 +1）。 */
  stars: number;
  /** 本轮是否刚获得一颗新星星（触发前端庆祝动画）。 */
  starAwarded: boolean;
  /** 距下一颗星星还剩几轮对话。 */
  starsUntilNext: number;
}

/** 会话累计星星查询响应（AI-408，供 Home 展示）。 */
export interface ChatStarsResponse {
  /** 该用户全部会话累计星星数之和。 */
  stars: number;
}

/** 鉴权 deferred：userId 缺省占位（与 AI-108 审计默认、评测 DTO 一致）。 */
const ANONYMOUS_USER_ID = 'anonymous';
/** 儿童对话低温度（AI-404）：降低随机性，保证输出稳定、安全、可预期。 */
const CHAT_TEMPERATURE = 0.4;
/** 对话回复最大 token（足够 1-3 句英文 + 少量中文解释）。 */
const CHAT_MAX_TOKENS = 512;

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(AiChatSession)
    private readonly sessionRepo: Repository<AiChatSession>,
    @InjectRepository(AiChatMessage)
    private readonly messageRepo: Repository<AiChatMessage>,
    @Inject(AI_PROVIDER_TOKEN)
    private readonly provider: AiProvider,
    private readonly safety: ChatSafetyService,
  ) {}

  /**
   * 处理一次聊天发言。
   * @param dto 请求体（已通过全局 ValidationPipe）
   * @returns 聊天响应 {@link ChatSendResponse}
   * @throws ChatError 会话不存在(404) / provider 错误(429/502/503)
   */
  async sendMessage(dto: ChatMessageDto): Promise<ChatSendResponse> {
    const userId = dto.userId?.trim() || ANONYMOUS_USER_ID;
    const session = await this.resolveSession(dto, userId);

    // 内容安全双保险（AI-406）：黑名单 + NVIDIA 分类器，任一命中即拦截。
    // 不安全 → 不调 LLM，直接返回狐狸安全兜底回复（同样 TTS），降低风险与成本。
    const verdict = await this.safety.checkUserInput(dto.text);
    let replyText: string;
    if (!verdict.safe) {
      replyText = SAFE_FALLBACK_REPLY;
      logger.warn(
        `[ChatService] 用户输入命中内容安全(${verdict.reason})，返回安全兜底回复 session=${session.id}`,
      );
    } else {
      // 加载历史（按时间升序），组装对话上下文。
      const history = await this.messageRepo.find({
        where: { sessionId: session.id },
        order: { createdAt: 'ASC' },
      });
      const messages: ChatMessage[] = [
        { role: 'system', content: buildChatSystemPrompt(session.sceneId) },
        ...history.map((m) => ({ role: m.role, content: m.text })),
        { role: 'user', content: dto.text },
      ];
      const reply = await this.generateReply(messages);
      replyText = stripMetaMarkers(reply.text);
    }

    // 落库：用户发言 + 助手回复（audioPath 持久化留待 AI-407，详见设计文档 §3）。
    await this.messageRepo.save(
      this.messageRepo.create({
        sessionId: session.id,
        role: 'user',
        text: dto.text,
      }),
    );
    const assistantMsg = await this.messageRepo.save(
      this.messageRepo.create({
        sessionId: session.id,
        role: 'assistant',
        text: replyText,
        audioPath: null,
      }),
    );

    const ttsUrl = await this.synthesizeTtsUrl(replyText);

    // AI-408：完成 N 轮对话给星星。轮数 = 本会话用户发言条数（每条发言触发一条狐狸回复）。
    const rounds = await this.messageRepo.count({
      where: { sessionId: session.id, role: 'user' },
    });
    const award: StarAward = computeStars(rounds, session.stars);
    if (award.starAwarded) {
      session.stars = award.stars;
      await this.sessionRepo.save(session);
      logger.info(
        `[ChatService] 会话 ${session.id} 达成星星里程碑：stars=${award.stars}（rounds=${rounds}）`,
      );
    }

    return {
      sessionId: session.id,
      messageId: assistantMsg.id,
      replyText,
      ttsUrl,
      stars: session.stars,
      starAwarded: award.starAwarded,
      starsUntilNext: award.starsUntilNext,
    };
  }

  /**
   * 查询某用户全部对话会话累计星星数之和（AI-408，供 Home 展示）。
   * @param userId 用户 id（缺省 `anonymous` 占位，与 sendMessage 口径一致）
   */
  async getStars(userId?: string): Promise<ChatStarsResponse> {
    const uid = userId?.trim() || ANONYMOUS_USER_ID;
    const row = await this.sessionRepo
      .createQueryBuilder('s')
      .select('COALESCE(SUM(s.stars), 0)', 'total')
      .where('s.userId = :uid', { uid })
      .getRawOne<{ total: string | number }>();
    const stars = Number(row?.total ?? 0);
    return { stars };
  }

  /**
   * 列出某用户全部对话会话摘要（AI-409，「我的会话」列表）。
   * 按「最近活动」倒序（最新对话的会话排最前），每条含消息数、最近消息预览、
   * 累计星星数。仅取 user/assistant 消息做统计（排除 system 系统提示）。
   * @param userId 用户 id（缺省 `anonymous` 占位，与 sendMessage 口径一致）
   */
  async listSessions(userId?: string): Promise<ChatSessionSummary[]> {
    const uid = userId?.trim() || ANONYMOUS_USER_ID;
    const sessions = await this.sessionRepo.find({ where: { userId: uid } });
    if (sessions.length === 0) return [];
    const sessionIds = sessions.map((s) => s.id);
    const messages = await this.messageRepo.find({
      where: { sessionId: In(sessionIds) },
      order: { createdAt: 'ASC' },
    });
    return buildSessionSummaries(
      sessions.map((s) => ({
        id: s.id,
        sceneId: s.sceneId,
        stars: s.stars,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      messages.map((m) => ({
        sessionId: m.sessionId,
        role: m.role,
        text: m.text,
        createdAt: m.createdAt,
      })),
    );
  }

  /**
   * 取回某会话的全部历史消息（AI-409，续聊前回显）。按时间升序，仅
   * user/assistant（排除 system 系统提示）；`ttsUrl` 当前恒为 null（历史音频
   * 未落库路径，见 chat-sessions.ts 文件头说明）。
   * @param sessionId 会话 id（对应 `ai_chat_sessions.id`）
   * @param userId 预留鉴权字段（当前 deferred，未做跨用户过滤，与全仓库 AI 接口口径一致）
   */
  async getSessionMessages(
    sessionId: string,
    _userId?: string,
  ): Promise<ChatHistoryMessage[]> {
    const messages = await this.messageRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
    return messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => toHistoryMessage(m));
  }

  /** 解析或创建会话：提供 sessionId 复用（不存在 → 404）；否则新建。 */
  private async resolveSession(
    dto: ChatMessageDto,
    userId: string,
  ): Promise<AiChatSession> {
    if (dto.sessionId) {
      const existing = await this.sessionRepo.findOne({ where: { id: dto.sessionId } });
      if (!existing) {
        throw new ChatError(
          404,
          'CHAT_SESSION_NOT_FOUND',
          `会话不存在：${dto.sessionId}`,
        );
      }
      return existing;
    }
    return this.sessionRepo.save(
      this.sessionRepo.create({ userId, sceneId: dto.sceneId ?? null }),
    );
  }

  /** 调用 LLM 生成回复；provider 异常映射为 ChatError。 */
  private async generateReply(messages: ChatMessage[]): Promise<ChatResult> {
    try {
      return await this.provider.chat(messages, {
        temperature: CHAT_TEMPERATURE,
        maxTokens: CHAT_MAX_TOKENS,
      });
    } catch (err) {
      throw this.mapProviderError(err);
    }
  }

  /**
   * 把 provider 异常映射为 {@link ChatError}（与 `AiProviderException` 的
   * `statusCode` 对齐，但用鸭子类型避免与具体 provider 耦合）：
   * 429→限流、401/403→不可用、其它→生成失败。
   */
  private mapProviderError(err: unknown): ChatError {
    const status = extractStatusCode(err);
    if (status === 429) {
      return new ChatError(429, 'AI_RATE_LIMITED', 'AI 请求过于频繁，请稍后再试');
    }
    if (status === 401 || status === 403) {
      return new ChatError(503, 'AI_UNAVAILABLE', 'AI 服务暂不可用（密钥或权限）');
    }
    logger.error('[ChatService] provider.chat 失败', err as Error);
    return new ChatError(502, 'AI_GENERATION_FAILED', 'AI 生成失败，请稍后重试');
  }

  /**
   * 合成 TTS 音频并归一化为可播放引用：
   * - `audioUrl` 直接返回；
   * - `audioBase64` 包成 `data:${mimeType};base64,...`；
   * - 均无 / 失败 → null（优雅降级，不阻断文本回复）。
   */
  private async synthesizeTtsUrl(text: string): Promise<string | null> {
    try {
      const audio: AudioResult = await this.provider.synthesize(text);
      if (audio.audioUrl) return audio.audioUrl;
      if (audio.audioBase64) {
        return `data:${audio.mimeType};base64,${audio.audioBase64}`;
      }
      return null;
    } catch (err) {
      logger.warn(
        `[ChatService] TTS 失败，降级仅返回文本：${(err as Error)?.message ?? 'unknown'}`,
      );
      return null;
    }
  }
}

/** 从 provider 异常中安全提取 HTTP 风格状态码（鸭子类型，容忍包装层）。 */
function extractStatusCode(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'statusCode' in err) {
    const v = (err as { statusCode?: number }).statusCode;
    return typeof v === 'number' ? v : undefined;
  }
  return undefined;
}
