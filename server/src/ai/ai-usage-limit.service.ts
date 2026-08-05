import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AiUsage } from './ai-usage.entity';
import { AiQuotaExceededError } from './ai-quota-error';
import { AiQuotaConfig, QuotaState, computeQuotaState, readAiQuotaConfig } from './ai-quota';
import { logger } from '../common/logger/logger';

/** 把 `Date` 归一为 `YYYY-MM-DD`（UTC，跨时区确定性，便于单测）。 */
export function dateKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * 每用户每日 AI 配额引擎（AI-107）。
 *
 * 持久化到 `ai_usage` 表（userId + date 唯一），记录当日调用次数与 token 用量；
 * 超限时抛 {@link AiQuotaExceededError}（429 + degraded）。
 *
 * 设计为可独立消费的纯服务（未来 AI 控制器可在调用 provider 前 `await
 * assertWithinQuota`、调用成功后 `recordUsage`），同时也被
 * `UsageLimitedAiProvider` 在最外层自动套用，使所有 `AiProvider` 消费方免费获得配额。
 */
@Injectable()
export class AiUsageLimitService {
  constructor(
    @InjectRepository(AiUsage)
    private readonly repo: Repository<AiUsage>,
    private readonly config: ConfigService,
  ) {}

  private get cfg(): AiQuotaConfig {
    return readAiQuotaConfig(this.config);
  }

  /** 读取某用户当日配额状态（无记录则视为 0 / 未超限）。 */
  async getState(userId: string, now: Date = new Date()): Promise<QuotaState> {
    const date = dateKey(now);
    const row = await this.repo.findOne({ where: { userId, date } });
    const callCount = row?.callCount ?? 0;
    const tokenCount = row?.tokenCount ?? 0;
    return computeQuotaState(userId, date, callCount, tokenCount, this.cfg);
  }

  /**
   * 调用前校验：若当日调用次数或 token 用量已达上限则抛 429。
   * `estimatedTokens` 为本次预计增量（默认 0，仅按当前累计判断）。
   */
  async assertWithinQuota(
    userId: string,
    estimatedTokens = 0,
    now: Date = new Date(),
  ): Promise<void> {
    const state = await this.getState(userId, now);
    if (state.callCount >= state.callLimit || state.tokenCount + estimatedTokens > state.tokenLimit) {
      throw new AiQuotaExceededError(
        `用户 ${userId} 于 ${state.date} 的 AI 配额已用尽（调用 ${state.callCount}/${state.callLimit}，` +
          `token ${state.tokenCount}/${state.tokenLimit}），请次日再试或联系管理员提升额度`,
        {
          userId,
          date: state.date,
          callLimit: state.callLimit,
          tokenLimit: state.tokenLimit,
          callCount: state.callCount,
          tokenCount: state.tokenCount,
        },
      );
    }
  }

  /**
   * 调用成功后记账：累加调用次数与 token 用量（同一 userId+date 行 upsert）。
   * 跨日自动开启新行（date 作为行键）。仅对成功调用计费——失败 / 重试不计，
   * 避免瞬时错误虚增配额（与 AI-106 重试共存）。
   */
  async recordUsage(userId: string, tokens = 0, now: Date = new Date()): Promise<QuotaState> {
    const date = dateKey(now);
    let row = await this.repo.findOne({ where: { userId, date } });
    if (!row) {
      row = this.repo.create({ userId, date, callCount: 0, tokenCount: 0 });
    }
    row.callCount += 1;
    row.tokenCount += tokens;
    // updatedAt 由 @UpdateDateColumn 在 save 时自动刷新，无需手动维护。
    const saved = await this.repo.save(row);
    logger.debug(
      `[AI] 配额记账 userId=${userId} date=${date} callCount=${saved.callCount} tokenCount=${saved.tokenCount}`,
    );
    return computeQuotaState(userId, date, saved.callCount, saved.tokenCount, this.cfg);
  }
}
