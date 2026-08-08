import { MascotStoryService } from './mascot-story.service';
import { MascotStory } from './mascot-story.entity';
import type { AiProvider } from './ai-provider.interface';
import type { Repository } from 'typeorm';

interface Overrides {
  storyFindOne?: MascotStory | null;
  userFindOne?: { id: string; totalStars: number; level?: number } | null;
  chat?: { text: string };
  chatError?: boolean;
}

function makeService(overrides: Overrides = {}) {
  const storyRepo: Partial<Repository<MascotStory>> = {
    findOne: jest.fn().mockResolvedValue(overrides.storyFindOne ?? null),
    save: jest.fn(async (e: any) => e),
    create: jest.fn((p?: any) => ({ ...(p ?? {}), id: 's1', createdAt: new Date() })),
  };
  const usersRepo: Partial<Repository<any>> = {
    findOne: jest.fn().mockResolvedValue(overrides.userFindOne ?? null),
  };
  const aiProvider: Partial<AiProvider> = { name: 'mock', chat: jest.fn() };
  if (overrides.chatError) {
    (aiProvider.chat as jest.Mock).mockRejectedValue(new Error('ai down'));
  } else {
    (aiProvider.chat as jest.Mock).mockResolvedValue(overrides.chat ?? { text: '{}' });
  }
  const service = new MascotStoryService(
    storyRepo as Repository<MascotStory>,
    usersRepo as Repository<any>,
    aiProvider as AiProvider,
  );
  return { service, storyRepo, usersRepo, aiProvider };
}

describe('MascotStoryService', () => {
  describe('getLevelInfo', () => {
    it('returns level 3 with progress for 130 stars', async () => {
      const { service } = makeService({
        userFindOne: { id: 'u1', totalStars: 130, level: 3 },
      });
      const info = await service.getLevelInfo('u1');
      expect(info.level).toBe(3);
      expect(info.totalStars).toBe(130);
      expect(info.levelStars).toBe(10); // 130 - 120
      expect(info.nextLevelStars).toBe(200);
      expect(info.isMaxLevel).toBe(false);
    });

    it('defaults to level 1 when user missing', async () => {
      const { service } = makeService({ userFindOne: null });
      const info = await service.getLevelInfo('u1');
      expect(info.level).toBe(1);
      expect(info.totalStars).toBe(0);
      expect(info.nextLevelStars).toBe(50);
      expect(info.isMaxLevel).toBe(false);
    });

    it('derives level from totalStars when user.level absent', async () => {
      const { service } = makeService({ userFindOne: { id: 'u1', totalStars: 250, level: undefined } });
      const info = await service.getLevelInfo('u1');
      expect(info.level).toBe(4); // thresholds [0,50,120,200,300,500] => 250>=200 && <300 => lv4
    });

    it('reports isMaxLevel at top threshold', async () => {
      const { service } = makeService({ userFindOne: { id: 'u1', totalStars: 999, level: 6 } });
      const info = await service.getLevelInfo('u1');
      expect(info.level).toBe(6);
      expect(info.isMaxLevel).toBe(true);
      expect(info.nextLevelStars).toBe(999);
    });
  });

  describe('getOrGenerateStory', () => {
    it('returns existing story without calling AI (idempotent)', async () => {
      const existing = {
        id: 'e1',
        userId: 'u1',
        level: 2,
        title: 'T',
        storyText: 'S',
        isDefault: false,
        createdAt: new Date(),
      };
      const { service, aiProvider } = makeService({ storyFindOne: existing });
      const res = await service.getOrGenerateStory('u1', 2);
      expect(aiProvider.chat).not.toHaveBeenCalled();
      expect(res.title).toBe('T');
      expect(res.isDefault).toBe(false);
    });

    it('generates via AI on first request and persists real story', async () => {
      const { service, aiProvider } = makeService({
        userFindOne: { id: 'u1', totalStars: 130 },
        chat: { text: JSON.stringify({ title: '新剧情', storyText: '长大啦' }) },
      });
      const res = await service.getOrGenerateStory('u1', 3);
      expect(aiProvider.chat).toHaveBeenCalledTimes(1);
      expect(res.title).toBe('新剧情');
      expect(res.storyText).toBe('长大啦');
      expect(res.isDefault).toBe(false);
    });

    it('falls back to template when AI throws', async () => {
      const { service, aiProvider } = makeService({
        userFindOne: { id: 'u1', totalStars: 130 },
        chatError: true,
      });
      const res = await service.getOrGenerateStory('u1', 3);
      expect(aiProvider.chat).toHaveBeenCalledTimes(1);
      expect(res.isDefault).toBe(true);
      expect(res.title).toBeDefined();
      expect(res.storyText).toBeDefined();
    });

    it('falls back to template when AI returns invalid JSON', async () => {
      const { service } = makeService({
        userFindOne: { id: 'u1', totalStars: 130 },
        chat: { text: 'not json at all' },
      });
      const res = await service.getOrGenerateStory('u1', 3);
      expect(res.isDefault).toBe(true);
    });

    it('clamps invalid level to 1', async () => {
      const { service } = makeService({ storyFindOne: null, userFindOne: { id: 'u1', totalStars: 0 } });
      const res = await service.getOrGenerateStory('u1', -5);
      expect(res.level).toBe(1);
    });
  });
});
