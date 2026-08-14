import { PictureBookService } from './picture-book.service';
import { PictureBook } from './picture-book.entity';
import type { AiProvider } from './ai-provider.interface';
import type { Repository } from 'typeorm';

interface Overrides {
  bookFindOne?: PictureBook | null;
  courseFindOne?: { id: string; lessons: { words: { text: string }[] }[] } | null;
  chat?: { text: string };
  chatError?: boolean;
  synthesize?: { audioUrl?: string; audioBase64?: string; mimeType?: string };
}

function makeService(overrides: Overrides = {}) {
  const bookRepo: Partial<Repository<PictureBook>> = {
    findOne: jest.fn().mockResolvedValue(overrides.bookFindOne ?? null),
    save: jest.fn(async (e: any) => e),
    create: jest.fn((p?: any) => ({ ...(p ?? {}), id: 'b1', createdAt: new Date() })),
  };
  const courseRepo: Partial<Repository<any>> = {
    findOne: jest.fn().mockResolvedValue(overrides.courseFindOne ?? null),
  };
  const lessonRepo: Partial<Repository<any>> = { findOne: jest.fn() };
  const wordRepo: Partial<Repository<any>> = { findOne: jest.fn() };
  const aiProvider: Partial<AiProvider> = {
    name: 'bigmodel',
    chat: jest.fn(),
    synthesize: jest.fn(),
  };
  if (overrides.chatError) {
    (aiProvider.chat as jest.Mock).mockRejectedValue(new Error('ai down'));
  } else {
    (aiProvider.chat as jest.Mock).mockResolvedValue(overrides.chat ?? { text: '{}' });
  }
  (aiProvider.synthesize as jest.Mock).mockResolvedValue(
    overrides.synthesize ?? { audioBase64: '', mimeType: 'audio/mp3' },
  );

  const service = new PictureBookService(
    bookRepo as Repository<PictureBook>,
    courseRepo as Repository<any>,
    lessonRepo as Repository<any>,
    wordRepo as Repository<any>,
    aiProvider as AiProvider,
  );
  return { service, bookRepo, courseRepo, aiProvider };
}

describe('PictureBookService', () => {
  describe('getOrGenerateBook', () => {
    it('returns existing book without calling AI (idempotent)', async () => {
      const existing = {
        id: 'e1',
        userId: 'u1',
        courseId: 'c1',
        title: 'T',
        storyText: 'S',
        pages: JSON.stringify([{ pageNumber: 1, text: 'a', illustrationPrompt: 'b' }]),
        coverImagePrompt: '',
        isDefault: false,
        createdAt: new Date(),
      };
      const { service, aiProvider } = makeService({ bookFindOne: existing as any });
      const res = await service.getOrGenerateBook('u1', 'c1');
      expect(aiProvider.chat).not.toHaveBeenCalled();
      expect(res.title).toBe('T');
      expect(res.isDefault).toBe(false);
      expect(res.pages).toHaveLength(1);
    });

    it('generates via AI on first request and persists real book', async () => {
      const { service, aiProvider } = makeService({
        chat: {
          text: JSON.stringify({
            title: '新绘本',
            coverImagePrompt: '封面',
            pages: [
              { pageNumber: 1, text: '第1页 apple cat', illustrationPrompt: 'i1' },
              { pageNumber: 2, text: '第2页 dog', illustrationPrompt: 'i2' },
            ],
          }),
        },
      });
      const res = await service.getOrGenerateBook('u1', 'c1');
      expect(aiProvider.chat).toHaveBeenCalledTimes(1);
      expect(res.title).toBe('新绘本');
      expect(res.pages).toHaveLength(2);
      expect(res.isDefault).toBe(false);
    });

    it('falls back to template when AI throws', async () => {
      const { service, aiProvider } = makeService({ chatError: true });
      const res = await service.getOrGenerateBook('u1', 'c1');
      expect(aiProvider.chat).toHaveBeenCalledTimes(1);
      expect(res.isDefault).toBe(true);
      expect(res.title).toBeDefined();
      expect(res.pages.length).toBeGreaterThanOrEqual(2);
    });

    it('falls back to template when AI returns invalid JSON', async () => {
      const { service } = makeService({ chat: { text: 'not json at all' } });
      const res = await service.getOrGenerateBook('u1', 'c1');
      expect(res.isDefault).toBe(true);
    });

    it('does not query course repo when courseId is empty (sample book)', async () => {
      const { service, courseRepo } = makeService({
        chat: {
          text: JSON.stringify({
            title: '示例',
            pages: [{ pageNumber: 1, text: 'x', illustrationPrompt: 'y' }],
          }),
        },
      });
      await service.getOrGenerateBook('u1');
      expect(courseRepo.findOne).not.toHaveBeenCalled();
    });

    it('collects course words when course exists', async () => {
      const { service, courseRepo, aiProvider } = makeService({
        courseFindOne: {
          id: 'c1',
          lessons: [{ words: [{ text: 'apple' }, { text: 'cat' }] }, { words: [{ text: 'dog' }] }],
        },
        chat: {
          text: JSON.stringify({
            title: '课内绘本',
            pages: [{ pageNumber: 1, text: 'apple cat dog 一起玩', illustrationPrompt: 'z' }],
          }),
        },
      });
      await service.getOrGenerateBook('u1', 'c1');
      expect(courseRepo.findOne).toHaveBeenCalledTimes(1);
      // user message must carry the course words so the agent can weave them in.
      const sent = (aiProvider.chat as jest.Mock).mock.calls[0][0];
      const userMsg = sent.find((m: any) => m.role === 'user');
      expect(JSON.parse(userMsg.content).courseWords).toEqual(['apple', 'cat', 'dog']);
    });
  });

  describe('synthesizeTts', () => {
    it('returns audioUrl directly', async () => {
      const { service } = makeService({ synthesize: { audioUrl: 'https://x/a.mp3' } });
      expect(await service.synthesizeTts('hi')).toEqual({ ttsUrl: 'https://x/a.mp3' });
    });

    it('wraps audioBase64 into a data URL', async () => {
      const { service } = makeService({ synthesize: { audioBase64: 'BASE64', mimeType: 'audio/mp3' } });
      expect(await service.synthesizeTts('hi')).toEqual({
        ttsUrl: 'data:audio/mp3;base64,BASE64',
      });
    });

    it('returns null when no audio is available', async () => {
      const { service } = makeService({ synthesize: { audioBase64: '', mimeType: 'audio/mp3' } });
      expect(await service.synthesizeTts('hi')).toEqual({ ttsUrl: null });
    });
  });
});
