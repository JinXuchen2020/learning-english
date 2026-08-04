import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AiUsageLimitService, dateKey } from './ai-usage-limit.service';
import { AiUsage } from './ai-usage.entity';
import { AiQuotaExceededError } from './ai-quota-error';

/** 假 Repository：内存无状态，行为由每个用例的 `findOne` mock 决定。 */
function makeRepo() {
  return {
    findOne: jest.fn(),
    create: jest.fn((e: Partial<AiUsage>) => Object.assign(new AiUsage(), e)),
    save: jest.fn(async (e: AiUsage) => ({ ...e })),
  } as unknown as Repository<AiUsage>;
}

/** 最小 ConfigService 桩。 */
function stubConfig(map: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => map[k] } as unknown as ConfigService;
}

const NOW = new Date('2026-01-01T12:00:00Z');
const TODAY = dateKey(NOW);

describe('AiUsageLimitService', () => {
  let repo: Repository<AiUsage>;
  let service: AiUsageLimitService;

  beforeEach(() => {
    repo = makeRepo();
    service = new AiUsageLimitService(repo, stubConfig({ AI_DAILY_CALL_LIMIT: '5', AI_DAILY_TOKEN_LIMIT: '100' }));
  });

  describe('getState', () => {
    it('returns a zero / not-limited state when there is no row', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      const s = await service.getState('u1', NOW);
      expect(s.callCount).toBe(0);
      expect(s.tokenCount).toBe(0);
      expect(s.callsRemaining).toBe(5);
      expect(s.tokensRemaining).toBe(100);
      expect(s.limited).toBe(false);
      expect(s.date).toBe(TODAY);
    });

    it('reflects persisted counts from an existing row', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({
        userId: 'u1',
        date: TODAY,
        callCount: 3,
        tokenCount: 40,
      } as AiUsage);
      const s = await service.getState('u1', NOW);
      expect(s.callCount).toBe(3);
      expect(s.tokenCount).toBe(40);
      expect(s.callsRemaining).toBe(2);
      expect(s.tokensRemaining).toBe(60);
      expect(s.limited).toBe(false);
    });
  });

  describe('assertWithinQuota', () => {
    it('resolves when under both limits', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({ callCount: 2, tokenCount: 10 } as AiUsage);
      await expect(service.assertWithinQuota('u1', 0, NOW)).resolves.toBeUndefined();
    });

    it('throws AiQuotaExceededError (429, degraded) when call count is at the limit', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({ callCount: 5, tokenCount: 10 } as AiUsage);
      await expect(service.assertWithinQuota('u1', 0, NOW)).rejects.toBeInstanceOf(AiQuotaExceededError);
      try {
        await service.assertWithinQuota('u1', 0, NOW);
      } catch (err) {
        const e = err as AiQuotaExceededError;
        expect(e.statusCode).toBe(429);
        expect(e.code).toBe('QUOTA_EXCEEDED');
        expect(e.degraded).toBe(true);
        expect(e.detail.callLimit).toBe(5);
        expect(e.detail.callCount).toBe(5);
      }
    });

    it('throws when estimated tokens would push usage over the token limit', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({ callCount: 1, tokenCount: 100 } as AiUsage);
      await expect(service.assertWithinQuota('u1', 1, NOW)).rejects.toBeInstanceOf(AiQuotaExceededError);
    });

    it('does NOT throw when token usage exactly equals the limit with zero estimate', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({ callCount: 1, tokenCount: 100 } as AiUsage);
      await expect(service.assertWithinQuota('u1', 0, NOW)).resolves.toBeUndefined();
    });
  });

  describe('recordUsage', () => {
    it('creates a new row on first call and returns incremented state', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      const s = await service.recordUsage('u1', 0, NOW);
      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(s.callCount).toBe(1);
      expect(s.tokenCount).toBe(0);
    });

    it('increments an existing row instead of creating a new one', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({ userId: 'u1', date: TODAY, callCount: 1, tokenCount: 0 } as AiUsage);
      await service.recordUsage('u1', 0, NOW);
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalledTimes(1);
      const saved = (repo.save as jest.Mock).mock.calls[0][0] as AiUsage;
      expect(saved.callCount).toBe(2);
    });

    it('accumulates tokens across calls', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({ userId: 'u1', date: TODAY, callCount: 1, tokenCount: 30 } as AiUsage);
      const s = await service.recordUsage('u1', 20, NOW);
      expect(s.tokenCount).toBe(50);
    });

    it('opens a fresh row when the date rolls over (no cross-day bleed)', async () => {
      const tomorrow = new Date('2026-01-02T12:00:00Z');
      // No prior rows for either day -> each call must create its own daily row.
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      const s1 = await service.recordUsage('u1', 0, NOW);
      const s2 = await service.recordUsage('u1', 0, tomorrow);
      expect(repo.create).toHaveBeenCalledTimes(2); // one per distinct date
      expect(s1.date).toBe(TODAY);
      expect(s1.callCount).toBe(1);
      expect(s2.date).toBe('2026-01-02');
      expect(s2.callCount).toBe(1); // fresh row for the new day
    });
  });
});
