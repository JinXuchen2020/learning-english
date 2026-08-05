import { ConfigService } from '@nestjs/config';
import {
  readAiQuotaConfig,
  computeQuotaState,
  DEFAULT_DAILY_CALL_LIMIT,
  DEFAULT_DAILY_TOKEN_LIMIT,
} from './ai-quota';

/** 最小 ConfigService 桩：返回给定 env map。 */
function stubConfig(map: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => map[k] } as unknown as ConfigService;
}

describe('readAiQuotaConfig', () => {
  it('returns safe defaults when both env vars are missing', () => {
    const cfg = readAiQuotaConfig(stubConfig({}));
    expect(cfg.dailyCallLimit).toBe(DEFAULT_DAILY_CALL_LIMIT);
    expect(cfg.dailyTokenLimit).toBe(DEFAULT_DAILY_TOKEN_LIMIT);
  });

  it('returns safe defaults when env vars are empty strings', () => {
    const cfg = readAiQuotaConfig(stubConfig({ AI_DAILY_CALL_LIMIT: '', AI_DAILY_TOKEN_LIMIT: '' }));
    expect(cfg.dailyCallLimit).toBe(DEFAULT_DAILY_CALL_LIMIT);
    expect(cfg.dailyTokenLimit).toBe(DEFAULT_DAILY_TOKEN_LIMIT);
  });

  it('returns safe defaults when env vars are non-numeric / non-positive', () => {
    const cfg = readAiQuotaConfig(
      stubConfig({ AI_DAILY_CALL_LIMIT: 'abc', AI_DAILY_TOKEN_LIMIT: '-5' }),
    );
    expect(cfg.dailyCallLimit).toBe(DEFAULT_DAILY_CALL_LIMIT);
    expect(cfg.dailyTokenLimit).toBe(DEFAULT_DAILY_TOKEN_LIMIT);
  });

  it('honours explicit positive overrides', () => {
    const cfg = readAiQuotaConfig(
      stubConfig({ AI_DAILY_CALL_LIMIT: '3', AI_DAILY_TOKEN_LIMIT: '500' }),
    );
    expect(cfg.dailyCallLimit).toBe(3);
    expect(cfg.dailyTokenLimit).toBe(500);
  });
});

describe('computeQuotaState', () => {
  const cfg = { dailyCallLimit: 10, dailyTokenLimit: 1000 };

  it('reports remaining equal to limits and not limited when no usage', () => {
    const s = computeQuotaState('u1', '2026-01-01', 0, 0, cfg);
    expect(s.callsRemaining).toBe(10);
    expect(s.tokensRemaining).toBe(1000);
    expect(s.limited).toBe(false);
    expect(s.callLimit).toBe(10);
    expect(s.tokenLimit).toBe(1000);
  });

  it('subtracts usage with a floor of 0 (never negative remaining)', () => {
    const s = computeQuotaState('u1', '2026-01-01', 8, 1200, cfg);
    expect(s.callsRemaining).toBe(2);
    expect(s.tokensRemaining).toBe(0); // 1000 - 1200 floored to 0
    expect(s.limited).toBe(true); // token exceeded
  });

  it('flags limited when call count reaches the limit exactly', () => {
    const s = computeQuotaState('u1', '2026-01-01', 10, 0, cfg);
    expect(s.limited).toBe(true);
    expect(s.callsRemaining).toBe(0);
  });

  it('flags limited when token usage reaches the limit exactly', () => {
    const s = computeQuotaState('u1', '2026-01-01', 0, 1000, cfg);
    expect(s.limited).toBe(true);
    expect(s.tokensRemaining).toBe(0);
  });
});
