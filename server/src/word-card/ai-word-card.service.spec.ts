import { NotFoundException, ConflictException } from '@nestjs/common';
import { AiWordCardService } from './ai-word-card.service';
import { AiWordCard, WordCardStatus } from './ai-word-card.entity';
import { GenerateWordCardDto } from './dto/generate-word-card.dto';
import { ContentUnsafeException } from './word-card-exceptions';
import { AiProvider } from '../ai/ai-provider.interface';

/** 内存版 Repository mock（支持 save 数组 / findOne / find 过滤 + 排序）。 */
function makeRepo(initial?: AiWordCard[]) {
  let store: AiWordCard[] = initial ? [...initial] : [];
  let seq = 0;
  const persist = (e: any) => {
    const saved = { ...e, id: e.id || `id-${++seq}`, createdAt: e.createdAt || new Date() };
    const idx = store.findIndex((s) => s.id === saved.id);
    if (idx >= 0) store[idx] = saved;
    else store.push(saved);
    return saved;
  };
  return {
    store,
    save: jest.fn(async (e: any) => (Array.isArray(e) ? e.map(persist) : persist(e))),
    findOne: jest.fn(async (opts: any) => {
      const id = opts?.where?.id;
      return store.find((s) => s.id === id) || null;
    }),
    find: jest.fn(async (opts: any) => {
      const status = opts?.where?.status as WordCardStatus | undefined;
      const rows = status ? store.filter((s) => s.status === status) : store;
      const desc = opts?.order?.createdAt === 'DESC';
      return [...rows].sort((a, b) => {
        const av = (a.createdAt?.toString?.() ?? '') as string;
        const bv = (b.createdAt?.toString?.() ?? '') as string;
        return desc ? (av < bv ? 1 : -1) : av > bv ? 1 : -1;
      });
    }),
  };
}

function makeService(repoMock: any, aiProvider: AiProvider) {
  return new AiWordCardService(aiProvider as any, repoMock as any);
}

describe('AiWordCardService.generate (AI-601 生成 + 校验 + 降级 + 安全)', () => {
  it('合法 JSON → 解析落 pending、degraded=false、model 透传', async () => {
    const repo = makeRepo();
    const aiProvider: AiProvider = {
      name: 'openai-compatible',
      chat: jest.fn(async () => ({
        text: JSON.stringify([
          { wordText: 'apple', meaning: '苹果', example: 'I eat an apple.', imagePrompt: 'a red apple' },
          { wordText: 'cat', meaning: '猫', example: 'The cat sleeps.', imagePrompt: 'a cute cat' },
        ]),
        model: 'mock-model',
      })),
      chatWithImage: jest.fn(),
      transcribe: jest.fn(),
      assessPronunciation: jest.fn(),
      synthesize: jest.fn(),
    };
    const svc = makeService(repo, aiProvider);

    const res = await svc.generate({ interest: '动物', count: 2 } as GenerateWordCardDto);

    expect(res.degraded).toBe(false);
    expect(res.model).toBe('mock-model');
    expect(res.cards).toHaveLength(2);
    expect(res.cards.every((c) => c.status === 'pending')).toBe(true);
    expect(repo.save).toHaveBeenCalledTimes(1);
    // 来源兴趣被记录
    expect(res.cards[0].interest).toBe('动物');
  });

  it('坏 JSON → 重试耗尽后降级内置模板（degraded=true），仍落 pending', async () => {
    const repo = makeRepo();
    const aiProvider: AiProvider = {
      name: 'openai-compatible',
      chat: jest.fn(async () => ({ text: '这不是合法 JSON', model: 'mock-model' })),
      chatWithImage: jest.fn(),
      transcribe: jest.fn(),
      assessPronunciation: jest.fn(),
      synthesize: jest.fn(),
    };
    const svc = makeService(repo, aiProvider);

    const res = await svc.generate({ interest: '食物', count: 3 } as GenerateWordCardDto);

    expect(aiProvider.chat).toHaveBeenCalledTimes(AiWordCardService.MAX_ATTEMPTS);
    expect(res.degraded).toBe(true);
    expect(res.model).toBe('template');
    expect(res.cards.length).toBe(3);
    expect(res.cards.every((c) => c.status === 'pending')).toBe(true);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('生成文本命中内容安全黑名单 → 抛 ContentUnsafeException(422) 且不留库', async () => {
    const repo = makeRepo();
    const aiProvider: AiProvider = {
      name: 'openai-compatible',
      chat: jest.fn(async () => ({
        text: JSON.stringify([
          {
            wordText: 'dog',
            meaning: '狗',
            example: 'I will kill the dog.', // 命中黑名单 kill
            imagePrompt: 'a dog',
          },
        ]),
        model: 'mock-model',
      })),
      chatWithImage: jest.fn(),
      transcribe: jest.fn(),
      assessPronunciation: jest.fn(),
      synthesize: jest.fn(),
    };
    const svc = makeService(repo, aiProvider);

    await expect(
      svc.generate({ interest: '动物', count: 1 } as GenerateWordCardDto),
    ).rejects.toBeInstanceOf(ContentUnsafeException);
    expect(repo.save).not.toHaveBeenCalled();
  });
});

describe('AiWordCardService.approve / reject / list (AI-601 审核流转)', () => {
  it('approve：pending → approved 并写 approvedAt', async () => {
    const pending = {
      id: 'c1',
      wordText: 'apple',
      meaning: '苹果',
      example: 'I eat an apple.',
      exampleTrans: null,
      imagePrompt: 'a red apple',
      interest: '食物',
      courseId: null,
      status: 'pending' as WordCardStatus,
      reviewerNote: null,
      createdAt: new Date('2026-08-07T00:00:00Z'),
      approvedAt: null,
    };
    const repo = makeRepo([pending]);
    const svc = makeService(repo, { name: 'mock' } as any);

    const view = await svc.approve('c1', '看起来不错');

    expect(view.status).toBe('approved');
    expect(view.approvedAt).not.toBeNull();
    expect(view.reviewerNote).toBe('看起来不错');
  });

  it('approve：已终态（approved）→ 抛 ConflictException', async () => {
    const approved = {
      id: 'c2',
      wordText: 'cat',
      meaning: '猫',
      example: 'The cat sleeps.',
      exampleTrans: null,
      imagePrompt: 'a cat',
      interest: '动物',
      courseId: null,
      status: 'approved' as WordCardStatus,
      reviewerNote: null,
      createdAt: new Date(),
      approvedAt: new Date(),
    };
    const repo = makeRepo([approved]);
    const svc = makeService(repo, { name: 'mock' } as any);

    await expect(svc.approve('c2')).rejects.toBeInstanceOf(ConflictException);
  });

  it('approve：未知 id → 抛 NotFoundException', async () => {
    const repo = makeRepo();
    const svc = makeService(repo, { name: 'mock' } as any);
    await expect(svc.approve('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reject：pending → rejected（approvedAt 保持 null）', async () => {
    const pending = {
      id: 'c3',
      wordText: 'fish',
      meaning: '鱼',
      example: 'The fish swims.',
      exampleTrans: null,
      imagePrompt: 'a fish',
      interest: '动物',
      courseId: null,
      status: 'pending' as WordCardStatus,
      reviewerNote: null,
      createdAt: new Date(),
      approvedAt: null,
    };
    const repo = makeRepo([pending]);
    const svc = makeService(repo, { name: 'mock' } as any);

    const view = await svc.reject('c3', '不合适');
    expect(view.status).toBe('rejected');
    expect(view.approvedAt).toBeNull();
    expect(view.reviewerNote).toBe('不合适');
  });

  it('list：按 status 过滤 + 倒序', async () => {
    const a = {
      id: 'a', wordText: 'x', meaning: 'x', example: 'x', exampleTrans: null,
      imagePrompt: 'x', interest: 'i', courseId: null, status: 'pending' as WordCardStatus,
      reviewerNote: null, createdAt: new Date('2026-08-01T00:00:00Z'), approvedAt: null,
    };
    const b = {
      id: 'b', wordText: 'y', meaning: 'y', example: 'y', exampleTrans: null,
      imagePrompt: 'y', interest: 'i', courseId: null, status: 'approved' as WordCardStatus,
      reviewerNote: null, createdAt: new Date('2026-08-09T00:00:00Z'), approvedAt: new Date(),
    };
    const repo = makeRepo([a, b]);
    const svc = makeService(repo, { name: 'mock' } as any);

    const pending = await svc.list('pending');
    expect(pending.map((c) => c.id)).toEqual(['a']);
    const all = await svc.list();
    // 倒序：b(08-09) 在 a(08-01) 前
    expect(all.map((c) => c.id)).toEqual(['b', 'a']);
  });
});
