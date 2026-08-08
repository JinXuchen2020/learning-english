import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { MascotStory } from './mascot-story.entity';
import { User } from '../entities/user.entity';
import { AiProvider, AI_PROVIDER_TOKEN } from './ai-provider.interface';
import {
  MASCOT_STORY_SYSTEM_PROMPT,
  parseMascotStoryOutput,
  DEFAULT_STORY_TITLE,
  DEFAULT_STORY_TEXT,
  MascotStoryAgentOutput,
} from './mascot-story-agent';
import { computeLevel, buildLevelInfo } from './mascot-level.util';
import type { MascotLevelInfo } from './mascot-level.util';
import { logger } from '../common/logger/logger';

/** `GET /api/ai/mascot/story/:level` 响应（AI-603）。 */
export interface MascotStoryResponse {
  level: number;
  title: string;
  storyText: string;
  /** true = 模板降级（AI 失败/解析失败）。 */
  isDefault: boolean;
  createdAt?: string;
}

/**
 * 吉祥物成长剧情服务（AI-603）。
 *
 * 职责：
 * - `getLevelInfo`：返回当前等级与进度（驱动前端等级环）。
 * - `getOrGenerateStory`：幂等获取/生成某等级剧情——已存在直接返回；
 *   否则调 `AiProvider.chat`（MascotStoryAgent）生成、解析、落库；失败降级模板（不 5xx）。
 *
 * 详见 `features/ai-603.md`。
 */
@Injectable()
export class MascotStoryService {
  constructor(
    @InjectRepository(MascotStory)
    private storyRepo: Repository<MascotStory>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @Inject(AI_PROVIDER_TOKEN)
    private aiProvider: AiProvider,
  ) {}

  /** 当前用户的等级与进度（无用户时按 0 星推导 level 1）。 */
  async getLevelInfo(userId: string): Promise<MascotLevelInfo> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    const totalStars = user?.totalStars ?? 0;
    const level = user?.level ?? computeLevel(totalStars);
    return buildLevelInfo(totalStars, level);
  }

  /** 获取（或按需生成）某等级的成长剧情，幂等。 */
  async getOrGenerateStory(userId: string, level: number): Promise<MascotStoryResponse> {
    const lv = Number.isInteger(level) && level >= 1 ? level : 1;

    // 1) 幂等：该等级已有剧情直接返回（快照语义）。
    const existing = await this.storyRepo.findOne({ where: { userId, level: lv } });
    if (existing) {
      return this.toResponse(existing, false);
    }

    const user = await this.usersRepo.findOne({ where: { id: userId } });
    const totalStars = user?.totalStars ?? 0;

    // 2) 调 MascotStoryAgent 生成。
    try {
      const out = await this.callAgent(lv, totalStars);
      const saved = await this.persist({
        userId,
        level: lv,
        title: out.title,
        storyText: out.storyText,
        isDefault: false,
      });
      return this.toResponse(saved, false);
    } catch (err) {
      // 3) AI 失败 / 解析失败 → 降级模板剧情（不持久化重试缓存，下次可重试真实生成）。
      logger.warn('[AI-603] MascotStoryAgent 调用/解析失败，降级模板剧情', err as Error);
      const saved = await this.persist({
        userId,
        level: lv,
        title: DEFAULT_STORY_TITLE,
        storyText: DEFAULT_STORY_TEXT,
        isDefault: true,
      });
      return this.toResponse(saved, true);
    }
  }

  /** 调用 MascotStoryAgent（AI-106 抽象），把等级/星星喂给模型并解析结构化输出。 */
  async callAgent(level: number, totalStars: number): Promise<MascotStoryAgentOutput> {
    const result = await this.aiProvider.chat(
      [
        { role: 'system', content: MASCOT_STORY_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            level,
            totalStars,
            mascotName: '小狐狸',
            childName: '宝贝',
          }),
        },
      ],
      { temperature: 0.8, maxTokens: 500, timeoutMs: 60000 },
    );
    return parseMascotStoryOutput(result.text);
  }

  /**
   * 持久化剧情，捕获唯一约束 race（并发同 (userId,level) 落库）。
   * 命中唯一约束 → 回查已有返回，保证不 500。
   */
  private async persist(
    partial: Pick<MascotStory, 'userId' | 'level' | 'title' | 'storyText' | 'isDefault'>,
  ): Promise<MascotStory> {
    try {
      return await this.storyRepo.save(this.storyRepo.create(partial));
    } catch (err) {
      if (err instanceof QueryFailedError && /UNIQUE/i.test(String(err.message))) {
        const existing = await this.storyRepo.findOne({
          where: { userId: partial.userId, level: partial.level },
        });
        if (existing) return existing;
      }
      throw err;
    }
  }

  private toResponse(story: MascotStory, isDefaultOverride: boolean): MascotStoryResponse {
    return {
      level: story.level,
      title: story.title,
      storyText: story.storyText,
      isDefault: story.isDefault ?? isDefaultOverride,
      createdAt: story.createdAt ? story.createdAt.toISOString() : undefined,
    };
  }
}
