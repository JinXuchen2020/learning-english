import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { User } from '../entities/user.entity';
import { AiReport } from './ai-report.entity';
import { AiParentEmailLog } from './ai-parent-email-log.entity';
import { AiReportService, DailyReportStats } from './ai-report.service';
import { EmailService } from './email.service';
import { logger } from '../common/logger/logger';

/** 一周内每日统计的聚合指标（AI-506 §5）。 */
export interface WeeklyReportMetrics {
  /** 有学习活动的天数（任务/单词/课程/口语任一 >0）。 */
  activeDays: number;
  /** 7 日完成任务数求和。 */
  totalTasksCompleted: number;
  /** 7 日练习单词数求和（每日不同单词，可能跨天重复计数）。 */
  totalWordsPracticed: number;
  /** 7 日完成课程数求和。 */
  totalLessonsCompleted: number;
  /** 7 日口语跟读次数求和。 */
  totalSpeechAttempts: number;
  /** 7 日口语平均分（非 null 天的均值四舍五入；全周无口语为 null）。 */
  avgSpeechScore: number | null;
}

/** 趋势点（供 AI-507 图表复用）。 */
export interface MasteryTrendPoint {
  date: string;
  avgSpeechScore: number | null;
  taskComplete: number;
}

/** 每日亮点（来自已落库 `ai_reports`）。 */
export interface DailySummary {
  date: string;
  summaryText: string;
  suggestionText: string;
  isDefault: boolean;
}

/** 家长周报聚合结果（结构化，含可直接发送的 HTML）。 */
export interface WeeklyReportData {
  userId: string;
  childName: string;
  weekStart: string; // YYYY-MM-DD（Monday）
  weekEnd: string; // YYYY-MM-DD（Sunday）
  metrics: WeeklyReportMetrics;
  /** 7 日弱项单词按频次排序 Top10。 */
  weakWordsTop: string[];
  masteryTrend: MasteryTrendPoint[];
  dailySummaries: DailySummary[];
  /** 汇集的非空明日建议。 */
  suggestions: string[];
  /** 自包含 HTML 邮件正文。 */
  html: string;
}

/** `generateAndSendWeeklyReport` 的返回。 */
export type WeeklyReportSendResult =
  | { skipped: true; reason: 'user-not-found' }
  | { skipped: true; reason: 'no-recipient'; weekStart: string }
  | { success: true; recipientEmail: string; weekStart: string; emailLogId: string; messageId: string }
  | { success: false; recipientEmail: string; weekStart: string; error: string };

/**
 * 家长周报服务（AI-506，M5 报告聚合与发信）。
 *
 * 职责：
 * - 聚合儿童一周（7 天）学习统计为 `WeeklyReportData`（≥4 项指标 + 弱项 Top + 趋势 + 亮点）；
 * - 渲染自包含 cozy-kids HTML 邮件；
 * - `generateAndSendWeeklyReport` 解析收件人（parentEmail 或覆盖）→ 发信 → 落 `AiParentEmailLog`（可追溯）；
 *   无收件人安全跳过；发信失败落 `failed` 且不向上抛（调度整轮不中断）。
 *
 * 复用 AI-502 `AiReportService.getDailyStats` 逐日聚合，避免重复统计逻辑。
 * 详见 `features/ai-506.md`。
 */
@Injectable()
export class WeeklyReportService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(AiReport)
    private reportRepo: Repository<AiReport>,
    @InjectRepository(AiParentEmailLog)
    private emailLogRepo: Repository<AiParentEmailLog>,
    private aiReportService: AiReportService,
    private emailService: EmailService,
  ) {}

  /** 返回 `date` 所在周的 Monday（ISO 周起始）`YYYY-MM-DD`（UTC 口径，与每日报告一致）。 */
  weekStartOf(date: string): string {
    const d = new Date(`${date}T00:00:00.000Z`);
    const day = d.getUTCDay(); // 0=Sun..6=Sat
    const diff = (day + 6) % 7; // Monday=0
    d.setUTCDate(d.getUTCDate() - diff);
    return d.toISOString().split('T')[0];
  }

  /** 给定 YYYY-MM-DD 加 n 天（UTC），返回 YYYY-MM-DD。 */
  private addDays(date: string, n: number): string {
    const d = new Date(`${date}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().split('T')[0];
  }

  /** 聚合并生成一周报告（不发送）。 */
  async buildWeeklyReport(userId: string, weekStart?: string): Promise<WeeklyReportData> {
    const ws = this.weekStartOf(weekStart || todayUtc());
    const we = this.addDays(ws, 6);

    const user = await this.userRepo.findOne({ where: { id: userId } });
    const childName = user?.nickname || '孩子';

    const days: string[] = [];
    for (let i = 0; i < 7; i++) days.push(this.addDays(ws, i));

    // 逐日聚合（单日失败不致命 → 视为 0 活动日）。
    const daily: DailyReportStats[] = [];
    for (const day of days) {
      try {
        daily.push(await this.aiReportService.getDailyStats(userId, day));
      } catch {
        daily.push(emptyStats(day));
      }
    }

    const activeDays = daily.filter(
      (s) => s.taskComplete > 0 || s.wordsPracticed > 0 || s.lessonsCompleted > 0 || s.speechAttempts > 0,
    ).length;

    const totals = daily.reduce(
      (acc, s) => {
        acc.taskComplete += s.taskComplete;
        acc.wordsPracticed += s.wordsPracticed;
        acc.lessonsCompleted += s.lessonsCompleted;
        acc.speechAttempts += s.speechAttempts;
        return acc;
      },
      { taskComplete: 0, wordsPracticed: 0, lessonsCompleted: 0, speechAttempts: 0 },
    );

    const scoredDays = daily.filter((s) => s.avgSpeechScore != null);
    const avgSpeechScore =
      scoredDays.length > 0
        ? Math.round(scoredDays.reduce((sum, s) => sum + (s.avgSpeechScore as number), 0) / scoredDays.length)
        : null;

    // 弱项 Top10：汇集 7 日 weakWordCandidates，按频次排序。
    const freq = new Map<string, number>();
    for (const s of daily) {
      for (const w of s.weakWordCandidates) freq.set(w, (freq.get(w) ?? 0) + 1);
    }
    const weakWordsTop = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([w]) => w);

    const masteryTrend: MasteryTrendPoint[] = daily.map((s, i) => ({
      date: days[i],
      avgSpeechScore: s.avgSpeechScore,
      taskComplete: s.taskComplete,
    }));

    const reports = await this.reportRepo.find({
      where: { userId, date: Between(ws, we) },
      order: { date: 'ASC' },
    });
    const dailySummaries: DailySummary[] = reports.map((r) => ({
      date: r.date,
      summaryText: r.summaryText,
      suggestionText: r.suggestionText,
      isDefault: r.isDefault,
    }));
    const suggestions = dailySummaries.map((d) => d.suggestionText).filter((s) => !!s && s.trim().length > 0);

    const metrics: WeeklyReportMetrics = {
      activeDays,
      totalTasksCompleted: totals.taskComplete,
      totalWordsPracticed: totals.wordsPracticed,
      totalLessonsCompleted: totals.lessonsCompleted,
      totalSpeechAttempts: totals.speechAttempts,
      avgSpeechScore,
    };

    const data: WeeklyReportData = {
      userId,
      childName,
      weekStart: ws,
      weekEnd: we,
      metrics,
      weakWordsTop,
      masteryTrend,
      dailySummaries,
      suggestions,
      html: '',
    };
    data.html = this.renderHtml(data);
    return data;
  }

  /** 生成并发送周报邮件；无收件人安全跳过；发信失败落 `failed` 且不向上抛。 */
  async generateAndSendWeeklyReport(
    userId: string,
    opts?: { weekStart?: string; recipientEmail?: string },
  ): Promise<WeeklyReportSendResult> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      logger.warn(`[AI-506] 用户 ${userId} 不存在，跳过周报`);
      return { skipped: true, reason: 'user-not-found' };
    }

    const ws = this.weekStartOf(opts?.weekStart ?? todayUtc());
    const recipient = opts?.recipientEmail || user.parentEmail;
    if (!recipient) {
      logger.info(`[AI-506] 用户 ${userId} 无家长邮箱，跳过周报（${ws}）`);
      return { skipped: true, reason: 'no-recipient', weekStart: ws };
    }

    const we = this.addDays(ws, 6);
    const report = await this.buildWeeklyReport(userId, ws);
    const subject = `【狐狸英语】${user.nickname} 的本周学习周报 (${ws} ~ ${we})`;

    try {
      const result = await this.emailService.sendWeeklyReport({
        to: recipient,
        subject,
        html: report.html,
        userId,
        weekStart: ws,
      });
      const saved = await this.emailLogRepo.save(
        this.emailLogRepo.create({
          userId,
          recipientEmail: recipient,
          subject,
          status: 'sent',
          weekStart: ws,
          htmlPath: result.htmlPath ?? null,
        }),
      );
      return {
        success: true,
        recipientEmail: recipient,
        weekStart: ws,
        emailLogId: saved.id,
        messageId: result.messageId,
      };
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      logger.warn(`[AI-506] 用户 ${userId} 周报发送失败（落 failed 日志，继续）`, err as Error);
      await this.emailLogRepo.save(
        this.emailLogRepo.create({
          userId,
          recipientEmail: recipient,
          subject,
          status: 'failed',
          weekStart: ws,
          htmlPath: null,
          errorText,
        }),
      );
      return { success: false, recipientEmail: recipient, weekStart: ws, error: errorText };
    }
  }

  /** 渲染自包含 cozy-kids HTML 邮件（内联样式，兼容邮件客户端）。 */
  private renderHtml(data: WeeklyReportData): string {
    const m = data.metrics;
    const score = m.avgSpeechScore == null ? '—' : String(m.avgSpeechScore);
    const weakWords =
      data.weakWordsTop.length > 0
        ? `<ul>${data.weakWordsTop.map((w) => `<li><b>${escapeHtml(w)}</b></li>`).join('')}</ul>`
        : '<p style="color:#8a8a8a;">本周暂无显著弱项，棒棒哒！</p>';
    const daily = data.dailySummaries.length > 0
      ? data.dailySummaries
          .map(
            (d) =>
              `<li style="margin:6px 0;"><b>${d.date}</b>：${escapeHtml(d.summaryText)}${
                d.suggestionText ? ` <span style="color:#F8A6B2;">建议：${escapeHtml(d.suggestionText)}</span>` : ''
              }</li>`,
          )
          .join('')
      : '<li style="color:#8a8a8a;">本周暂无每日小结记录。</li>';

    return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#FFF7F0;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#4a3b32;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="text-align:center;background:#FFE9D6;border-radius:20px;padding:20px;">
      <div style="font-size:48px;">🦊</div>
      <h1 style="margin:8px 0;color:#E8895B;font-size:22px;">${escapeHtml(data.childName)} 的本周学习周报</h1>
      <p style="margin:0;color:#8a7a70;">${data.weekStart} ~ ${data.weekEnd}</p>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:12px;margin:20px 0;">
      ${metricCard('活跃天数', `${m.activeDays} 天`)}
      ${metricCard('完成任务', `${m.totalTasksCompleted}`)}
      ${metricCard('练习单词', `${m.totalWordsPracticed}`)}
      ${metricCard('完成课程', `${m.totalLessonsCompleted}`)}
      ${metricCard('口语跟读', `${m.totalSpeechAttempts} 次`)}
      ${metricCard('平均口语分', score)}
    </div>
    <div style="background:#fff;border-radius:16px;padding:18px;margin-bottom:16px;">
      <h2 style="color:#E8895B;font-size:18px;margin-top:0;">🌟 本周弱项 Top</h2>
      ${weakWords}
    </div>
    <div style="background:#fff;border-radius:16px;padding:18px;margin-bottom:16px;">
      <h2 style="color:#E8895B;font-size:18px;margin-top:0;">📖 每日亮点</h2>
      <ul style="padding-left:18px;line-height:1.6;">${daily}</ul>
    </div>
    <p style="text-align:center;color:#b0a098;font-size:12px;margin-top:24px;">
      由「狐狸英语」AI 学习伙伴生成 · 陪伴每个孩子快乐学英语
    </p>
  </div>
</body>
</html>`;
  }
}

function metricCard(label: string, value: string): string {
  return `<div style="flex:1 1 140px;background:#fff;border-radius:14px;padding:14px;text-align:center;box-shadow:0 2px 6px rgba(232,137,91,0.12);">
    <div style="font-size:22px;font-weight:700;color:#E8895B;">${value}</div>
    <div style="font-size:13px;color:#8a7a70;margin-top:4px;">${label}</div>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emptyStats(date: string): DailyReportStats {
  return {
    date,
    taskComplete: 0,
    wordsPracticed: 0,
    lessonsCompleted: 0,
    speechAttempts: 0,
    avgSpeechScore: null,
    weakWordCandidates: [],
  };
}

/** UTC 当日 `YYYY-MM-DD`（与每日报告口径一致）。 */
function todayUtc(): string {
  return new Date().toISOString().split('T')[0];
}
