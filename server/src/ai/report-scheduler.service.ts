import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { AiReportService } from './ai-report.service';
import { WeeklyReportService } from './weekly-report.service';
import { logger } from '../common/logger/logger';

/** 每日自动扫描触发的小时（本地时区，24h 制）。可通过环境变量覆盖。 */
const SWEEP_HOUR = (() => {
  const raw = process.env.REPORT_SWEEP_HOUR;
  const h = raw == null ? 20 : Number(raw);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 20;
})();

/**
 * 每周自动扫描触发的「星期几」（0=周日..6=周六，本地），默认周日。
 * 小时复用 `SWEEP_HOUR`（与每日扫描同一时刻档）。
 */
const WEEKLY_REPORT_DAY = (() => {
  const raw = process.env.WEEKLY_REPORT_DAY;
  const d = raw == null ? 0 : Number(raw);
  return Number.isInteger(d) && d >= 0 && d <= 6 ? d : 0;
})();

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * AI-505 / AI-506 自动触发调度。
 *
 * Trigger B（AI-505）：每日固定时段（默认 20:00）全量扫描所有用户，自动生成当日报告。
 * Trigger C（AI-506）：每周固定日/时（默认周日 20:00）扫描所有**含 parentEmail** 的用户，
 * 聚合一周学习数据生成并发送家长周报。
 *
 * 设计：
 * - 两个扫描均逐用户 try/catch，单个用户失败不中断整轮（AI 限流/超时只影响该用户）。
 * - 调度用轻量 `setTimeout` + `setInterval`（不引入 `@nestjs/schedule` 依赖）；
 *   `onModuleInit` 在 `NODE_ENV==='test'` 或对应 `*_ENABLED==='false'` 时跳过，避免测试挂定时器。
 *
 * 详见 `features/ai-505.md` / `features/ai-506.md`。
 */
@Injectable()
export class ReportSchedulerService implements OnModuleInit, OnModuleDestroy {
  private dailyTimer: ReturnType<typeof setTimeout> | null = null;
  private dailyInterval: ReturnType<typeof setInterval> | null = null;
  private weeklyTimer: ReturnType<typeof setTimeout> | null = null;
  private weeklyInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private aiReportService: AiReportService,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private weeklyReportService: WeeklyReportService,
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

  /** 返回距下一个「目标星期几:hour:00」（本地）的毫秒数；若当前已过的该时刻，则等到下周同日。 */
  computeMsUntilNextWeekday(dayOfWeek: number, hour: number, now: Date): number {
    const target = new Date(now);
    target.setHours(hour, 0, 0, 0); // 今天该时刻
    const currentDay = target.getDay();
    let diffDays = (dayOfWeek - currentDay + 7) % 7;
    if (diffDays === 0 && target.getTime() <= now.getTime()) {
      diffDays = 7; // 今天该时刻已过 → 顺延一周
    }
    target.setDate(target.getDate() + diffDays);
    return target.getTime() - now.getTime();
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

  /** 每周扫描：仅对含 parentEmail 的用户生成并发送家长周报（逐用户容错，无邮箱者跳过）。 */
  async runWeeklySweep(): Promise<void> {
    const users = await this.userRepo.find();
    const withEmail = users.filter((u) => !!u.parentEmail);
    logger.info(`[AI-506] 每周周报扫描开始，共 ${users.length} 用户，其中 ${withEmail.length} 含家长邮箱`);
    for (const u of withEmail) {
      try {
        const res = await this.weeklyReportService.generateAndSendWeeklyReport(u.id);
        if ('skipped' in res) {
          logger.info(`[AI-506] 用户 ${u.id} 周报跳过（${res.reason}）`);
        } else if (!res.success) {
          logger.warn(`[AI-506] 用户 ${u.id} 周报发送失败：${res.error}`);
        }
      } catch (err) {
        logger.warn(`[AI-506] 用户 ${u.id} 周报流程异常（跳过，继续下一用户）`, err as Error);
      }
    }
    logger.info('[AI-506] 每周周报扫描结束');
  }

  /** 启动每日调度：到点跑一次 sweep，之后每 24h 跑一次。 */
  startDaily(): void {
    this.stopDaily();
    const delay = this.computeMsUntilNext(SWEEP_HOUR, new Date());
    this.dailyTimer = setTimeout(() => {
      void this.runDailySweep().finally(() => {
        this.dailyInterval = setInterval(() => void this.runDailySweep(), DAY_MS);
      });
    }, delay);
  }

  /** 启动每周调度：到点跑一次 sweep，之后每 7 天跑一次。 */
  startWeekly(): void {
    this.stopWeekly();
    const delay = this.computeMsUntilNextWeekday(WEEKLY_REPORT_DAY, SWEEP_HOUR, new Date());
    this.weeklyTimer = setTimeout(() => {
      void this.runWeeklySweep().finally(() => {
        this.weeklyInterval = setInterval(() => void this.runWeeklySweep(), WEEK_MS);
      });
    }, delay);
  }

  stopDaily(): void {
    if (this.dailyTimer != null) {
      clearTimeout(this.dailyTimer);
      this.dailyTimer = null;
    }
    if (this.dailyInterval != null) {
      clearInterval(this.dailyInterval);
      this.dailyInterval = null;
    }
  }

  stopWeekly(): void {
    if (this.weeklyTimer != null) {
      clearTimeout(this.weeklyTimer);
      this.weeklyTimer = null;
    }
    if (this.weeklyInterval != null) {
      clearInterval(this.weeklyInterval);
      this.weeklyInterval = null;
    }
  }

  /** 停止全部调度并清除定时器。 */
  stop(): void {
    this.stopDaily();
    this.stopWeekly();
  }

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    if (process.env.REPORT_SWEEP_ENABLED !== 'false') this.startDaily();
    if (process.env.WEEKLY_REPORT_ENABLED !== 'false') this.startWeekly();
  }

  onModuleDestroy(): void {
    this.stop();
  }
}
