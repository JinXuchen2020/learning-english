import {
  buildSessionSummaries,
  toHistoryMessage,
  type SessionSeed,
  type MessageSeed,
} from './chat-sessions';
import { AiChatMessage } from './ai-chat-message.entity';

/**
 * chat-sessions 纯函数单测（AI-409）：buildSessionSummaries 排序/计数/预览，
 * toHistoryMessage 角色与 ttsUrl 映射。与 DB 解耦，纯逻辑覆盖。
 */

function seedSession(id: string, createdAt: number, over: Partial<SessionSeed> = {}): SessionSeed {
  return {
    id,
    sceneId: 'greeting',
    stars: 0,
    createdAt: new Date(createdAt),
    updatedAt: null,
    ...over,
  };
}

function seedMessage(
  sessionId: string,
  role: string,
  text: string,
  createdAt: number,
): MessageSeed {
  return { sessionId, role, text, createdAt: new Date(createdAt) };
}

describe('buildSessionSummaries (AI-409)', () => {
  it('空会话列表 → 返回空数组', () => {
    expect(buildSessionSummaries([], [])).toEqual([]);
  });

  it('无消息的会话 → messageCount=0, lastMessagePreview=null', () => {
    const sessions = [seedSession('a', 100)];
    const res = buildSessionSummaries(sessions, []);
    expect(res).toHaveLength(1);
    expect(res[0].messageCount).toBe(0);
    expect(res[0].lastMessagePreview).toBeNull();
    expect(res[0].createdAt).toBe(new Date(100).toISOString());
  });

  it('按「最近活动」倒序（最后一条消息时间新者排前）', () => {
    const sessions = [seedSession('a', 100), seedSession('b', 200)];
    const messages = [
      seedMessage('a', 'user', 'old', 150),
      seedMessage('b', 'user', 'new', 300), // b 最近活动更新
    ];
    const res = buildSessionSummaries(sessions, messages);
    expect(res.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('仅统计 user/assistant（排除 system），预览取最后一条可回显消息', () => {
    const sessions = [seedSession('a', 1)];
    const messages = [
      seedMessage('a', 'system', 'SYS PROMPT', 1),
      seedMessage('a', 'user', 'hello fox', 2),
      seedMessage('a', 'assistant', 'hi kid', 3),
    ];
    const res = buildSessionSummaries(sessions, messages);
    expect(res[0].messageCount).toBe(2); // 排除 system
    expect(res[0].lastMessagePreview).toBe('hi kid'); // 最后可回显消息
  });

  it('预览超长文本截断到 80 字符', () => {
    const long = 'x'.repeat(200);
    const sessions = [seedSession('a', 1)];
    const messages = [seedMessage('a', 'assistant', long, 2)];
    const res = buildSessionSummaries(sessions, messages);
    expect(res[0].lastMessagePreview).toHaveLength(80);
    expect(res[0].lastMessagePreview).toBe(long.slice(0, 80));
  });

  it('无 updatedAt 的会话仍按消息时间排序（不依赖 updatedAt）', () => {
    const sessions = [
      seedSession('a', 100, { updatedAt: null }),
      seedSession('b', 90, { updatedAt: null }),
    ];
    const messages = [
      seedMessage('a', 'user', 'a-msg', 120),
      seedMessage('b', 'user', 'b-msg', 500), // b 虽 createdAt 早，但活动更晚
    ];
    const res = buildSessionSummaries(sessions, messages);
    expect(res.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('toHistoryMessage (AI-409)', () => {
  function msg(role: string, audioPath: string | null): AiChatMessage {
    return {
      id: 'm1',
      sessionId: 'a',
      role: role as AiChatMessage['role'],
      text: 'hello',
      audioPath,
      createdAt: new Date(123),
    };
  }

  it('user 消息映射为 user 角色', () => {
    const r = toHistoryMessage(msg('user', null));
    expect(r.role).toBe('user');
    expect(r.text).toBe('hello');
    expect(r.ttsUrl).toBeNull();
  });

  it('assistant 消息映射为 assistant 角色', () => {
    const r = toHistoryMessage(msg('assistant', null));
    expect(r.role).toBe('assistant');
  });

  it('非回显角色（system）兜底归为 user，保持稳健', () => {
    const r = toHistoryMessage(msg('system', null));
    expect(r.role).toBe('user');
  });

  it('audioPath 为 null → ttsUrl 为 null（历史音频未落库路径）', () => {
    const r = toHistoryMessage(msg('assistant', null));
    expect(r.ttsUrl).toBeNull();
  });
});
