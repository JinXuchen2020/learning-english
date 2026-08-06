import { ChatService, ChatSendResponse } from './chat.service';
import { ChatMessageDto } from './chat-message.dto';
import { ChatError } from './chat.errors';
import { AiChatSession } from './ai-chat-session.entity';
import { AiChatMessage } from './ai-chat-message.entity';
import { AiProvider } from '../ai/ai-provider.interface';
import { SAFE_FALLBACK_REPLY } from './chat-safety.config';

/**
 * ChatService 单测（AI-403 + AI-406 安全拦截）。
 * 直接注入 mock 仓库 + mock provider + mock 安全服务，聚焦纯编排逻辑。
 */

/** 构造一个带内存存储的仓库 mock（find/findOne/save/create）。 */
function makeRepo<T extends { id?: string }>(initial: T[] = []): any {
  const store: T[] = [...initial];
  return {
    store,
    findOne: jest.fn(async (opts: { where?: { id?: string } }) => {
      const id = opts?.where?.id;
      return (id ? store.find((r) => r.id === id) : null) ?? null;
    }),
    find: jest.fn(async (opts: { where?: { sessionId?: string } }) => {
      const sid = opts?.where?.sessionId;
      return store
        .filter((r) => !sid || (r as any).sessionId === sid)
        .sort((a, b) => {
          const ta = (a as any).createdAt?.getTime?.() ?? 0;
          const tb = (b as any).createdAt?.getTime?.() ?? 0;
          return ta - tb;
        });
    }),
    save: jest.fn(async (e: T) => {
      const rec = { ...e, id: (e as any).id ?? `gen-${Math.random()}` } as T;
      store.push(rec);
      return rec;
    }),
    create: jest.fn((e: Partial<T>) => ({ ...e } as T)),
  };
}

/** 带鸭子类型 statusCode 的 provider 异常，模拟 AI-106 透传的 AiProviderException。 */
class FakeProviderError extends Error {
  statusCode: number;
  constructor(statusCode: number, message = 'boom') {
    super(message);
    this.statusCode = statusCode;
  }
}

function makeProvider(overrides: Partial<AiProvider> = {}): AiProvider {
  return {
    name: 'mock',
    chat: jest.fn(async () => ({ text: 'Fox says hi!' })),
    synthesize: jest.fn(async () => ({ audioBase64: 'BASE64', mimeType: 'audio/mp3' })),
    ...overrides,
  } as unknown as AiProvider;
}

function makeDto(overrides: Partial<ChatMessageDto> = {}): ChatMessageDto {
  return { text: 'Hello fox!', ...overrides } as ChatMessageDto;
}

/** 内容安全服务 mock：默认放行（安全）。 */
function makeSafety(overrides: Partial<any> = {}): any {
  return { checkUserInput: jest.fn(async () => ({ safe: true })), ...overrides };
}

/** 统一构造 ChatService（含安全服务注入），减少重复 4 参构造。 */
function makeService(
  sessionRepo: any,
  messageRepo: any,
  provider: any,
  safety: any = makeSafety(),
): ChatService {
  return new ChatService(sessionRepo, messageRepo, provider, safety);
}

describe('ChatService (AI-403)', () => {
  it('无 sessionId → 新建会话（默认 anonymous + sceneId 写入），并落库 user+assistant', async () => {
    const sessionRepo = makeRepo<AiChatSession>();
    const messageRepo = makeRepo<AiChatMessage>();
    const provider = makeProvider();
    const svc = makeService(sessionRepo as any, messageRepo as any, provider);

    const res = await svc.sendMessage(makeDto({ sceneId: 'zoo' }));

    expect(sessionRepo.save).toHaveBeenCalledTimes(1);
    const savedSession = sessionRepo.save.mock.calls[0][0];
    expect(savedSession.userId).toBe('anonymous');
    expect(savedSession.sceneId).toBe('zoo');
    expect(messageRepo.save).toHaveBeenCalledTimes(2);
    const roles = messageRepo.save.mock.calls.map((c: any) => c[0].role);
    expect(roles).toEqual(['user', 'assistant']);
    expect(res.sessionId).toBeDefined();
    expect(res.replyText).toBe('Fox says hi!');
    expect(res.messageId).toBeDefined();
  });

  it('提供 sessionId 且存在 → 复用会话，不新建', async () => {
    const existing: AiChatSession = {
      id: 'sess-1',
      userId: 'u1',
      sceneId: 'greeting',
      stars: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const sessionRepo = makeRepo<AiChatSession>([existing]);
    const messageRepo = makeRepo<AiChatMessage>();
    const provider = makeProvider();
    const svc = makeService(sessionRepo as any, messageRepo as any, provider);

    const res = await svc.sendMessage(makeDto({ sessionId: 'sess-1' }));

    expect(sessionRepo.save).not.toHaveBeenCalled();
    expect(res.sessionId).toBe('sess-1');
    expect(res.replyText).toBe('Fox says hi!');
  });

  it('提供 sessionId 但不存在 → 抛 ChatError 404 CHAT_SESSION_NOT_FOUND', async () => {
    const sessionRepo = makeRepo<AiChatSession>();
    const provider = makeProvider();
    const svc = makeService(sessionRepo as any, makeRepo() as any, provider);

    await expect(svc.sendMessage(makeDto({ sessionId: 'nope' }))).rejects.toMatchObject({
      status: 404,
      code: 'CHAT_SESSION_NOT_FOUND',
    });
  });

  it('调用 LLM 使用低温度（AI-404：儿童对话稳定可预期）', async () => {
    const provider = makeProvider();
    const svc = makeService(makeRepo() as any, makeRepo() as any, provider);
    await svc.sendMessage(makeDto());

    const opts = (provider.chat as jest.Mock).mock.calls[0][1];
    expect(typeof opts.temperature).toBe('number');
    expect(opts.temperature).toBeGreaterThan(0);
    expect(opts.temperature).toBeLessThanOrEqual(0.5);
  });

  it('历史消息按时间升序进入 LLM 上下文（system + history + user）', async () => {
    const session: AiChatSession = {
      id: 'sess-2',
      userId: 'u1',
      sceneId: null,
      stars: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const history: AiChatMessage[] = [
      { id: 'm1', sessionId: 'sess-2', role: 'user', text: 'old user', audioPath: null, createdAt: new Date(1) },
      { id: 'm2', sessionId: 'sess-2', role: 'assistant', text: 'old fox', audioPath: null, createdAt: new Date(2) },
    ];
    const sessionRepo = makeRepo<AiChatSession>([session]);
    const messageRepo = makeRepo<AiChatMessage>(history);
    const provider = makeProvider();
    const svc = makeService(sessionRepo as any, messageRepo as any, provider);

    await svc.sendMessage(makeDto({ sessionId: 'sess-2', text: 'new user' }));

    const sent = (provider.chat as jest.Mock).mock.calls[0][0];
    expect(sent[0].role).toBe('system');
    expect(sent[1]).toEqual({ role: 'user', content: 'old user' });
    expect(sent[2]).toEqual({ role: 'assistant', content: 'old fox' });
    expect(sent[sent.length - 1]).toEqual({ role: 'user', content: 'new user' });
    expect(sent.length).toBe(4);
  });

  it('TTS 返回 audioUrl → ttsUrl 原样透传', async () => {
    const provider = makeProvider({
      synthesize: jest.fn(async () => ({ audioUrl: 'https://host/a.mp3', mimeType: 'audio/mpeg' })),
    });
    const svc = makeService(makeRepo() as any, makeRepo() as any, provider);
    const res = await svc.sendMessage(makeDto());
    expect(res.ttsUrl).toBe('https://host/a.mp3');
  });

  it('TTS 返回 audioBase64 → ttsUrl 包成 data URI', async () => {
    const provider = makeProvider({
      synthesize: jest.fn(async () => ({ audioBase64: 'BASE64', mimeType: 'audio/mp3' })),
    });
    const svc = makeService(makeRepo() as any, makeRepo() as any, provider);
    const res = await svc.sendMessage(makeDto());
    expect(res.ttsUrl).toBe('data:audio/mp3;base64,BASE64');
  });

  it('TTS 无音频 → ttsUrl 为 null', async () => {
    const provider = makeProvider({
      synthesize: jest.fn(async () => ({ mimeType: 'audio/mp3' })),
    });
    const svc = makeService(makeRepo() as any, makeRepo() as any, provider);
    const res = await svc.sendMessage(makeDto());
    expect(res.ttsUrl).toBeNull();
  });

  it('TTS 失败 → 优雅降级 ttsUrl=null，文本回复仍返回', async () => {
    const provider = makeProvider({
      synthesize: jest.fn(async () => {
        throw new Error('tts down');
      }),
    });
    const svc = makeService(makeRepo() as any, makeRepo() as any, provider);
    const res: ChatSendResponse = await svc.sendMessage(makeDto());
    expect(res.ttsUrl).toBeNull();
    expect(res.replyText).toBe('Fox says hi!');
  });

  it('provider.chat 429 → ChatError 429 AI_RATE_LIMITED', async () => {
    const provider = makeProvider({
      chat: jest.fn(async () => {
        throw new FakeProviderError(429);
      }),
    });
    const svc = makeService(makeRepo() as any, makeRepo() as any, provider);
    await expect(svc.sendMessage(makeDto())).rejects.toMatchObject({
      status: 429,
      code: 'AI_RATE_LIMITED',
    });
  });

  it('provider.chat 401 → ChatError 503 AI_UNAVAILABLE', async () => {
    const provider = makeProvider({
      chat: jest.fn(async () => {
        throw new FakeProviderError(401);
      }),
    });
    const svc = makeService(makeRepo() as any, makeRepo() as any, provider);
    await expect(svc.sendMessage(makeDto())).rejects.toMatchObject({
      status: 503,
      code: 'AI_UNAVAILABLE',
    });
  });

  it('provider.chat 502 / 未知异常 → ChatError 502 AI_GENERATION_FAILED', async () => {
    const provider502 = makeProvider({
      chat: jest.fn(async () => {
        throw new FakeProviderError(502);
      }),
    });
    const svc502 = makeService(makeRepo() as any, makeRepo() as any, provider502);
    await expect(svc502.sendMessage(makeDto())).rejects.toMatchObject({
      status: 502,
      code: 'AI_GENERATION_FAILED',
    });

    const providerUnknown = makeProvider({
      chat: jest.fn(async () => {
        throw new Error('weird');
      }),
    });
    const svcUnknown = makeService(makeRepo() as any, makeRepo() as any, providerUnknown);
    await expect(svcUnknown.sendMessage(makeDto())).rejects.toMatchObject({
      status: 502,
      code: 'AI_GENERATION_FAILED',
    });
  });
});

describe('ChatService 内容安全拦截 (AI-406)', () => {
  it('用户输入命中黑名单 → 返回安全兜底回复，且不调用 LLM', async () => {
    const provider = makeProvider();
    const safety = makeSafety({
      checkUserInput: jest.fn(async () => ({ safe: false, reason: 'blocklist' })),
    });
    const svc = makeService(makeRepo() as any, makeRepo() as any, provider, safety);
    const res = await svc.sendMessage(makeDto({ text: 'you are full of shit' }));

    expect(provider.chat).not.toHaveBeenCalled(); // 不调 LLM
    expect(res.replyText).toBe(SAFE_FALLBACK_REPLY);
    expect(res.ttsUrl).toBe('data:audio/mp3;base64,BASE64'); // 兜底回复同样走 TTS
    // 仍落库 user + assistant（助手=兜底回复），保持会话线程连续
    expect((provider.synthesize as jest.Mock).mock.calls[0][0]).toBe(SAFE_FALLBACK_REPLY);
  });

  it('用户输入命中分类器 → 返回安全兜底回复，且不调用 LLM', async () => {
    const provider = makeProvider();
    const safety = makeSafety({
      checkUserInput: jest.fn(async () => ({ safe: false, reason: 'classifier' })),
    });
    const svc = makeService(makeRepo() as any, makeRepo() as any, provider, safety);
    const res = await svc.sendMessage(makeDto({ text: 'a subtly harmful sentence' }));

    expect(provider.chat).not.toHaveBeenCalled();
    expect(res.replyText).toBe(SAFE_FALLBACK_REPLY);
  });

  it('输入安全 → 正常调 LLM 并返回 LLM 回复', async () => {
    const provider = makeProvider();
    const safety = makeSafety(); // 默认放行
    const svc = makeService(makeRepo() as any, makeRepo() as any, provider, safety);
    const res = await svc.sendMessage(makeDto({ text: 'Hello fox!' }));

    expect(provider.chat).toHaveBeenCalledTimes(1);
    expect(res.replyText).toBe('Fox says hi!');
  });
});
