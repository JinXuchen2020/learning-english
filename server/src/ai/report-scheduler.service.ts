import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { AiReportService } from './ai-report.service';
import { logger } from '../common/logger/logger';

/** 每日自动扫描触发的小时（本地时区，24h 制）。可通过环境变量覆盖。 */
const SWEEP_HOUR = (() => {
  const raw = process.env.REPORT_SWEEP_HOUR;
  const h = raw == null ? 20 : Number(raw);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 20;
})();

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * AI-505 Trigger B：每日固定时段（默认 20:00，本地）全量扫描所有用户，自动生成当日报告。
 *
 * 设计：
 * - `runDailySweep` 遍历 `users` 表每个用户调 `AiReportService.generateDailyReport(userId)`；
 *   逐用户 try/catch，单个用户失败不中断整轮（AI 限流/超时只影响该用户当天报告）。
 * - `generateDailyReport` 已幂等（同日已有报告直接返回），故重复扫描、与 Trigger A 并发均安全。
 * - 调度用轻量 `setTimeout` + `setInterval`（不引入 `@nestjs/schedule` 依赖）；
 *   `onModuleInit` 在 `NODE_ENV==='test'` 或 `REPORT_SWEEP_ENABLED==='false'` 时跳过，避免测试挂定时器。
 *
 * 详见 `features/ai-505.md`。
 */
@Injectable()
export class ReportSchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private aiReportService: AiReportService,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  /** 返回距下一个 `hour:00`（本地）的毫秒数；若当前已过今日该时刻，则等到明日该时刻。 */
  computeMsUntilNext(hour: number, now: Date): number {
    const next = new Date(now);
    next.setHours(hour, 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setTime(next.getTime() + DAY_MS);
    }
    return next.getTime() - now.getTime();
  }

  /** 全量扫描：为每个用户触发生成当日报告（逐用户容错）。 */
  async runDailySweep(): Promise<void> {
    const users = await this.userRepo.find();
    logger.info(`[AI-505] 每日报告扫描开始，共 ${users.length} 个用户`);
    for (const u of users) {
      try {
        await this.aiReportService.generateDailyReport(u.id);
      } catch (err) {
        logger.warn(`[AI-505] 用户 ${u.id} 自动生成报告失败（跳过，继续下一用户）`, err as Error);
      }
    }
    logger.info('[AI-505] 每日报告扫描结束');
  }

  /** 启动调度：到点跑一次 sweep，之后每 24h 跑一次。 */
  start(): void {
    this.stop();
    const delay = this.computeMsUntilNext(SWEEP_HOUR, new Date());
    this.timer = setTimeout(() => {
      void this.runDailySweep().finally(() => {
        this.interval = setInterval(() => void this.runDailySweep(), DAY_MS);
      });
    }, delay);
  }

  /** 停止调度并清除定时器。 */
  stop(): void {
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.interval != null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    if (process.env.REPORT_SWEEP_ENABLED === 'false') return;
    this.start();
  }

  onModuleDestroy(): void {
    this.stop();
  }
}
