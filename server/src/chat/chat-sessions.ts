import { AiChatSession } from './ai-chat-session.entity';
import { AiChatMessage } from './ai-chat-message.entity';

/**
 * 会话历史与续聊（AI-409）的纯类型与映射函数，与 DB / Nest 解耦，便于单测。
 *
 * 两个核心能力：
 * - `listSessions`：列出某用户全部对话会话的摘要（用于「我的会话」列表）。
 * - `getSessionMessages`：取回某会话的全部消息（用于续聊前的历史回显）。
 *
 * 历史消息回显只取 `user` / `assistant`（不回显 `system` 系统提示）。
 * 历史音频：`ai_chat_messages.audioPath` 当前恒为 null（AI-402 的 TTS 音频
 * 直接以 URL/data URI 返回，未落库路径），故历史回显 `ttsUrl` 恒为 null，
 * 仅文本回显（满足验收「历史消息完整回显」）。
 */

/** 会话摘要（前端「我的会话」列表项）。 */
export interface ChatSessionSummary {
  /** 会话 id（uuid）。 */
  id: string;
  /** 场景包 id（greeting/zoo/...）；自由对话为 null。 */
  sceneId: string | null;
  /** 本会话累计星星数（AI-408）。 */
  stars: number;
  /** 用户+助手消息条数（不含 system）。 */
  messageCount: number;
  /** 最近一条消息文本预览（截断），无消息为 null。 */
  lastMessagePreview: string | null;
  /** 会话创建时间（ISO 字符串）。 */
  createdAt: string;
  /** 会话更新时间（ISO 字符串，可能为 null）。 */
  updatedAt: string | null;
}

/** 历史消息（续聊前的回显气泡）。 */
export interface ChatHistoryMessage {
  /** 消息 id（uuid）。 */
  id: string;
  /** 角色：user / assistant（不含 system）。 */
  role: 'user' | 'assistant';
  /** 消息正文。 */
  text: string;
  /** 狐狸朗读音频引用；历史消息当前恒为 null（见文件头说明）。 */
  ttsUrl: string | null;
  /** 消息创建时间（ISO 字符串）。 */
  createdAt: string;
}

/** 预览截断长度（字符）。 */
const PREVIEW_MAX = 80;

/** `listSessions` 入参的会话最小形态（避免与 entity 强耦合，便于单测传字面量）。 */
export interface SessionSeed {
  id: string;
  sceneId: string | null;
  stars: number;
  createdAt: Date;
  updatedAt: Date | null;
}

/** `buildSessionSummaries` 入参的消息最小形态。 */
export interface MessageSeed {
  sessionId: string;
  role: string;
  text: string;
  createdAt: Date;
}

/**
 * 纯函数：由 session 列表 + 其全部消息构建前端摘要，按「最近活动」倒序。
 *
 * 最近活动 = 该会话最后一条 user/assistant 消息的 createdAt；无消息则用会话 createdAt。
 * 这样即使 `updatedAt` 为 null（从未触发星星落库），列表仍按真实对话时间排序。
 *
 * @param sessions 会话种子数组（已按任意顺序）
 * @param messages 这些会话的全部消息（user/assistant/system 均可，内部按角色过滤）
 * @returns 按最近活动倒序的 `ChatSessionSummary[]`
 */
export function buildSessionSummaries(
  sessions: SessionSeed[],
  messages: MessageSeed[],
): ChatSessionSummary[] {
  // 按 sessionId 分组消息，便于 O(1) 取某会话的对话。
  const bySession = new Map<string, MessageSeed[]>();
  for (const m of messages) {
    if (!bySession.has(m.sessionId)) bySession.set(m.sessionId, []);
    bySession.get(m.sessionId)!.push(m);
  }

  const built = sessions.map((s) => {
    const msgs = bySession.get(s.id) ?? [];
    // 仅统计可回显的角色（排除 system 系统提示）。
    const counted = msgs.filter((m) => m.role === 'user' || m.role === 'assistant');
    const last = counted[counted.length - 1];
    const lastActivity = last ? last.createdAt : s.createdAt;
    const summary: ChatSessionSummary = {
      id: s.id,
      sceneId: s.sceneId,
      stars: s.stars,
      messageCount: counted.length,
      lastMessagePreview: last ? last.text.slice(0, PREVIEW_MAX) : null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt ? s.updatedAt.toISOString() : null,
    };
    return { summary, lastActivity };
  });

  // 最近活动倒序（最新的会话排最前）。
  built.sort(
    (a, b) => b.lastActivity.getTime() - a.lastActivity.getTime(),
  );
  return built.map((x) => x.summary);
}

/** 合法回显角色。 */
const HISTORY_ROLES = new Set(['user', 'assistant']);

/**
 * 纯函数：把一条消息实体映射为历史消息 DTO。
 * - 仅保留 user/assistant（system 在调用前已过滤，这里兜底非回显角色归为 user 以保稳健）。
 * - `ttsUrl`：audioPath 当前恒为 null（见文件头）→ null；若未来落库音频路径再启用。
 */
export function toHistoryMessage(m: AiChatMessage): ChatHistoryMessage {
  const role: 'user' | 'assistant' = HISTORY_ROLES.has(m.role)
    ? (m.role as 'user' | 'assistant')
    : 'user';
  return {
    id: m.id,
    role,
    text: m.text,
    ttsUrl: m.audioPath ? m.audioPath : null,
    createdAt: m.createdAt.toISOString(),
  };
}
