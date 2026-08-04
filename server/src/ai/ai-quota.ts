import { ConfigService } from '@nestjs/config';

/**
 * 每日配额配置（AI-107）。
 *
 * 默认走保守值，避免误伤真实使用；本地验证 429 触发时可调小
 * `AI_DAILY_CALL_LIMIT` / `AI_DAILY_TOKEN_LIMIT`。
 */
export interface AiQuotaConfig {
  /** 每用户每日最大调用次数（所有 AI 能力各计 1 次）。 */
  dailyCallLimit: number;
  /** 每用户每日最大 token 用量（仅 chat/chatWithImage 上报真实用量）。 */
  dailyTokenLimit: number;
}

/** 生产默认：单用户每日 200 次调用 / 100k token，足够正常学习又不失控。 */
export const DEFAULT_DAILY_CALL_LIMIT = 200;
export const DEFAULT_DAILY_TOKEN_LIMIT = 100_000;

/**
 * 从 `ConfigService` 读取配额配置。
 * 环境变量缺失 / 空 / 非法时回退默认值（不抛错，保持「无配置应用可启动」契约）。
 */
export function readAiQuotaConfig(config: ConfigService): AiQuotaConfig {
  const callLimit = parseInt(config.get<string>('AI_DAILY_CALL_LIMIT') ?? '', 10);
  const tokenLimit = parseInt(config.get<string>('AI_DAILY_TOKEN_LIMIT') ?? '', 10);
  return {
    dailyCallLimit:
      Number.isFinite(callLimit) && callLimit > 0 ? callLimit : DEFAULT_DAILY_CALL_LIMIT,
    dailyTokenLimit:
      Number.isFinite(tokenLimit) && tokenLimit > 0 ? tokenLimit : DEFAULT_DAILY_TOKEN_LIMIT,
  };
}

/** 单个用户的当日配额状态快照。 */
export interface QuotaState {
  userId: string;
  /** 统计日期 `YYYY-MM-DD`。 */
  date: string;
  callCount: number;
  tokenCount: number;
  callLimit: number;
  tokenLimit: number;
  /** 剩余可调用次数（下界 0）。 */
  callsRemaining: number;
  /** 剩余可用 token（下界 0）。 */
  tokensRemaining: number;
  /** 已触及任一上限（调用次数或 token）。 */
  limited: boolean;
}

/**
 * 由持久化计数 + 配置计算状态快照（纯函数，便于单测，无副作用）。
 */
export function computeQuotaState(
  userId: string,
  date: string,
  callCount: number,
  tokenCount: number,
  cfg: AiQuotaConfig,
): QuotaState {
  const callsRemaining = Math.max(0, cfg.dailyCallLimit - callCount);
  const tokensRemaining = Math.max(0, cfg.dailyTokenLimit - tokenCount);
  return {
    userId,
    date,
    callCount,
    tokenCount,
    callLimit: cfg.dailyCallLimit,
    tokenLimit: cfg.dailyTokenLimit,
    callsRemaining,
    tokensRemaining,
    limited: callCount >= cfg.dailyCallLimit || tokenCount >= cfg.dailyTokenLimit,
  };
}
