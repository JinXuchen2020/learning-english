import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatError } from './chat.errors';
import { ChatMessageDto } from './chat-message.dto';
import { ChatScenesService } from './chat-scenes.service';
import { SceneSummary } from './chat-scenes';
import type { ChatSessionSummary, ChatHistoryMessage } from './chat-sessions';
import { HttpException, ValidationPipe, BadRequestException } from '@nestjs/common';

/**
 * ChatController 单测（AI-403 messages + AI-405 scenes）：验证响应透传、
 * ChatError→HttpException 翻译、未知异常不吞、scenes 端点透传枚举，
 * 以及全局 ValidationPipe 在控制器边界对非法 body 的拦截。
 */

/** 构造 ChatController，注入 mocked ChatService + ChatScenesService。 */
function makeController(
  chat: Partial<ChatService>,
  scenes: Partial<ChatScenesService> = {},
): ChatController {
  return new ChatController(
    chat as unknown as ChatService,
    scenes as unknown as ChatScenesService,
  );
}

describe('ChatController.messages (AI-403)', () => {
  it('service 成功 → 原样返回响应', async () => {
    const chat = {
      sendMessage: jest.fn(async () => ({
        sessionId: 's1',
        messageId: 'm1',
        replyText: 'Fox says hi!',
        ttsUrl: null,
        stars: 0,
        starAwarded: false,
        starsUntilNext: 8,
      })),
    };
    const c = makeController(chat);
    const res = await c.messages({ text: 'hello' } as ChatMessageDto);
    expect(res.replyText).toBe('Fox says hi!');
    expect(chat.sendMessage).toHaveBeenCalledWith({ text: 'hello' });
  });

  it('ChatError → HttpException（status + body.code）', async () => {
    const chat = {
      sendMessage: jest.fn(async () => {
        throw new ChatError(404, 'CHAT_SESSION_NOT_FOUND', '会话不存在：x');
      }),
    };
    const c = makeController(chat);
    await expect(c.messages({ text: 'hi' } as ChatMessageDto)).rejects.toMatchObject({
      status: 404,
      response: { code: 'CHAT_SESSION_NOT_FOUND' },
    });
  });

  it('其它异常 → 透传（不吞）', async () => {
    const chat = {
      sendMessage: jest.fn(async () => {
        throw new Error('boom');
      }),
    };
    const c = makeController(chat);
    await expect(c.messages({ text: 'hi' } as ChatMessageDto)).rejects.toThrow('boom');
  });
});

describe('ChatController.scenes (AI-405)', () => {
  it('透传 ChatScenesService.list() 结果', () => {
    const fakeSummaries: SceneSummary[] = [
      { id: 'greeting', title: '打招呼', openingLine: 'hi', targetVocabulary: ['hello'] },
    ];
    const scenes = { list: jest.fn(() => fakeSummaries) };
    const c = makeController({}, scenes);
    const res = c.scenes();
    expect(res).toBe(fakeSummaries);
    expect(scenes.list).toHaveBeenCalledTimes(1);
  });

  it('枚举返回 5 个场景且均不含 systemPrompt 字段', () => {
    const scenes = { list: jest.fn() };
    const c = makeController({}, scenes);
    // 直接用真实服务验证数据结构（控制器仅透传，真实服务保证内容正确）
    const real = new ChatScenesService();
    const summaries = real.list();
    expect(summaries).toHaveLength(5);
    const ids = summaries.map((s) => s.id).sort();
    expect(ids).toEqual(['body', 'greeting', 'shopping', 'weather', 'zoo']);
    for (const s of summaries) {
      expect(s).not.toHaveProperty('systemPrompt');
      expect(typeof s.title).toBe('string');
      expect(typeof s.openingLine).toBe('string');
      expect(Array.isArray(s.targetVocabulary)).toBe(true);
    }
  });
});

describe('ChatController.stars (AI-408)', () => {
  it('透传 ChatService.getStars 结果（含 userId 透传）', async () => {
    const chat = { getStars: jest.fn(async () => ({ stars: 5 })) };
    const c = makeController(chat);
    const res = await c.stars('u1');
    expect(res).toEqual({ stars: 5 });
    expect(chat.getStars).toHaveBeenCalledWith('u1');
  });

  it('不传 userId → 透传 undefined（service 内部回落 anonymous）', async () => {
    const chat = { getStars: jest.fn(async () => ({ stars: 0 })) };
    const c = makeController(chat);
    const res = await c.stars();
    expect(res).toEqual({ stars: 0 });
    expect(chat.getStars).toHaveBeenCalledWith(undefined);
  });
});

describe('ChatController 会话历史与续聊 (AI-409)', () => {
  it('GET sessions 透传 ChatService.listSessions（含 userId 透传）', async () => {
    const fake: ChatSessionSummary[] = [
      { id: 's1', sceneId: 'greeting', stars: 1, messageCount: 4, lastMessagePreview: 'hi', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: null },
    ];
    const chat = { listSessions: jest.fn(async () => fake) };
    const c = makeController(chat);
    const res = await c.sessions('u1');
    expect(res).toBe(fake);
    expect(chat.listSessions).toHaveBeenCalledWith('u1');
  });

  it('GET sessions/:id/messages 透传 ChatService.getSessionMessages（id + userId）', async () => {
    const fake: ChatHistoryMessage[] = [
      { id: 'm1', role: 'user', text: 'hi', ttsUrl: null, createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    const chat = { getSessionMessages: jest.fn(async () => fake) };
    const c = makeController(chat);
    const res = await c.sessionMessages('sess-9', 'u1');
    expect(res).toBe(fake);
    expect(chat.getSessionMessages).toHaveBeenCalledWith('sess-9', 'u1');
  });

  it('GET sessions/:id/messages 不传 userId → 透传 undefined', async () => {
    const chat = { getSessionMessages: jest.fn(async () => []) };
    const c = makeController(chat);
    await c.sessionMessages('sess-9');
    expect(chat.getSessionMessages).toHaveBeenCalledWith('sess-9', undefined);
  });
});

describe('ChatController + ValidationPipe (AI-403)', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

  it('合法 body 通过校验', async () => {
    const dto = await pipe.transform(
      { text: 'hi' },
      { type: 'body', metatype: ChatMessageDto },
    );
    expect(dto.text).toBe('hi');
  });

  it('缺 text → BadRequestException（400）', async () => {
    await expect(
      pipe.transform({}, { type: 'body', metatype: ChatMessageDto }),
    ).rejects.toThrow(BadRequestException);
  });

  it('额外字段 → BadRequestException（forbidNonWhitelisted）', async () => {
    await expect(
      pipe.transform({ text: 'hi', evil: 1 }, { type: 'body', metatype: ChatMessageDto }),
    ).rejects.toThrow(BadRequestException);
  });
});
