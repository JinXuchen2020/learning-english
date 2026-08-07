import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, QueryFailedError } from 'typeorm';
import { AiReport } from './ai-report.entity';
import { AiProvider, AI_PROVIDER_TOKEN, MascotExpression } from './ai-provider.interface';
import { TaskCompletion } from '../entities/task-completion.entity';
import { WordProgress } from '../entities/word-progress.entity';
import { LessonProgress } from '../entities/lesson-progress.entity';
import { AiSpeechAttempt } from './ai-speech-attempt.entity';
import {
  ReportAgentOutput,
  REPORT_AGENT_SYSTEM_PROMPT,
  parseReportAgentOutput,
  DEFAULT_SUMMARY,
  DEFAULT_SUGGESTION,
} from './report-agent';
import { logger } from '../common/logger/logger';

/** 当日学习统计（AI-502 聚合口径，详见 features/ai-502.md §3）。 */
export interface DailyReportStats {
  /** 报告日期 YYYY-MM-DD（UTC 口径）。 */
  date: string;
  /** 当日完成任务数（task_completions）。 */
  taskComplete: number;
  /** 当日练习的不同单词数（word_progress.lastPracticedAt ∈ 当日）。 */
  wordsPracticed: number;
  /** 当日完成的课程数（lesson_progress.completed & completedAt ∈ 当日）。 */
  lessonsCompleted: number;
  /** 当日口语跟读次数（ai_speech_attempts.createdAt ∈ 当日）。 */
  speechAttempts: number;
  /** 当日口语平均分 [0,100] 四舍五入；无口语尝试时为 null。 */
  avgSpeechScore: number | null;
}

/** `POST /api/ai/report/daily` 响应（AI-502）。 */
export interface DailyReportResponse {
  id?: string;
  userId: string;
  date: string;
  summaryText: string;
  weakWords: string[];
  suggestionText: string;
  /** true = 友好默认报告（无活动或 AI 失败降级）；false = AI 真实生成。 */
  isDefault: boolean;
  /** 来自 ReportAgent，驱动前端狐狸动画（返回已有报告时为 undefined）。 */
  mascotExpr?: MascotExpression;
  /** 真实统计（返回已有报告时为 null，因其是生成时快照）。 */
  stats: DailyReportStats | null;
  createdAt?: string;
}

/**
 * 每日 AI 报告服务（AI-502，M5 报告聚合与生成）。
 *
 * 职责：
 * - 聚合当日学习统计（任务完成 / 单词练习 / 课程完成 / 口语尝试与平均分）；
 * - 幂等：同日已有报告直接返回（AI-505 自动触发去重依赖此）；
 * - 无活动 → 友好默认报告（持久化，保证当日幂等、省 token）；
 * - 有活动 → 调 `AiProvider.chat(ReportAgent)` 生成真实小结并持久化；
 * - AI 失败 → 降级为友好默认报告（不持久化，待重试）。
 *
 * 详见 `features/ai-502.md`。
 */
@Injectable()
export class AiReportService {
  constructor(
    @InjectRepository(AiReport)
    private reportRepo: Repository<AiReport>,
    @InjectRepository(TaskCompletion)
    private taskCompletionRepo: Repository<TaskCompletion>,
    @InjectRepository(WordProgress)
    private wordProgressRepo: Repository<WordProgress>,
    @InjectRepository(LessonProgress)
    private lessonProgressRepo: Repository<LessonProgress>,
    @InjectRepository(AiSpeechAttempt)
    private speechAttemptRepo: Repository<AiSpeechAttempt>,
    @Inject(AI_PROVIDER_TOKEN)
    private aiProvider: AiProvider,
  ) {}

  /** 生成（或返回已有）每日报告。 */
  async generateDailyReport(userId: string, date?: string): Promise<DailyReportResponse> {
    const reportDate = date || todayUtc();

    // 1) 幂等：同日已有报告直接返回（snapshot 语义，stats 置 null）。
    const existing = await this.reportRepo.findOne({
      where: { userId, date: reportDate },
    });
    if (existing) {
      return this.toResponse(existing, false, undefined, null);
    }

    // 2) 聚合当日统计。
    const stats = await this.getDailyStats(userId, reportDate);

    const hasActivity =
      stats.taskComplete > 0 ||
      stats.wordsPracticed > 0 ||
      stats.lessonsCompleted > 0 ||
      stats.speechAttempts > 0;

    // 3) 无活动 → 友好默认（持久化，保证当日幂等，省去无意义 AI 调用）。
    if (!hasActivity) {
      const def = this.buildDefaultReport(userId, reportDate);
      const saved = await this.persistReport(def);
      return this.toResponse(saved, true, 'encourage', stats);
    }

    // 4) 有活动 → 调 ReportAgent 生成真实小结。
    try {
      const agentOut = await this.callReportAgent(stats);
      const saved = await this.persistReport(this.toEntity(userId, reportDate, agentOut));
      return this.toResponse(saved, false, agentOut.mascotExpr, stats);
    } catch (err) {
      // 5) AI 失败 → 降级友好默认（不持久化，避免缓存降级内容，下次可重试）。
      logger.warn('[AI-502] ReportAgent 调用失败，降级为友好默认报告', err as Error);
      const def = this.buildDefaultReport(userId, reportDate);
      return this.toResponse(def, true, 'encourage', stats);
    }
  }

  /** 聚合当日学习统计（AI-502 §3）。 */
  async getDailyStats(userId: string, date: string): Promise<DailyReportStats> {
    const [start, end] = dayBounds(date);

    const [taskComplete, wordRows, lessonRows, speechRows] = await Promise.all([
      this.taskCompletionRepo.count({ where: { userId, date } }),
      this.wordProgressRepo.find({
        where: { userId, lastPracticedAt: Between(start, end) },
      }),
      this.lessonProgressRepo.find({
        where: { userId, completed: true, completedAt: Between(start, end) },
      }),
      this.speechAttemptRepo.find({
        where: { userId, createdAt: Between(start, end) },
      }),
    ]);

    const wordsPracticed = wordRows.length;
    const lessonsCompleted = lessonRows.length;
    const speechAttempts = speechRows.length;
    const avgSpeechScore =
      speechAttempts > 0
        ? Math.round(
            speechRows.reduce((sum, r) => sum + (r.score || 0), 0) / speechAttempts,
          )
        : null;

    return {
      date,
      taskComplete,
      wordsPracticed,
      lessonsCompleted,
      speechAttempts,
      avgSpeechScore,
    };
  }

  /** 调用 ReportAgent（AI-106 抽象），把真实统计喂给模型并解析结构化输出。 */
  async callReportAgent(stats: DailyReportStats): Promise<ReportAgentOutput> {
    const result = await this.aiProvider.chat(
      [
        { role: 'system', content: REPORT_AGENT_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(stats) },
      ],
      { temperature: 0.6, maxTokens: 600, timeoutMs: 60000 },
    );
    return parseReportAgentOutput(result.text);
  }

  /**
   * 持久化报告，捕获唯一约束 race（并发同 (userId,date) 落库）。
   * 命中唯一约束 → 回查已有返回，保证不 500（AI-501 幂等兜底）。
   */
  private async persistReport(
    partial: Pick<AiReport, 'userId' | 'date' | 'summaryText' | 'weakWords' | 'suggestionText' | 'isDefault'>,
  ): Promise<AiReport> {
    try {
      return await this.reportRepo.save(this.reportRepo.create(partial));
    } catch (err) {
      if (err instanceof QueryFailedError && /UNIQUE/i.test(String(err.message))) {
        const existing = await this.reportRepo.findOne({
          where: { userId: partial.userId, date: partial.date },
        });
        if (existing) return existing;
      }
      throw err;
    }
  }

  private buildDefaultReport(
    userId: string,
    date: string,
  ): Pick<AiReport, 'userId' | 'date' | 'summaryText' | 'weakWords' | 'suggestionText' | 'isDefault'> {
    return {
      userId,
      date,
      summaryText: DEFAULT_SUMMARY,
      weakWords: [],
      suggestionText: DEFAULT_SUGGESTION,
      isDefault: true,
    };
  }

  private toEntity(
    userId: string,
    date: string,
    out: ReportAgentOutput,
  ): Pick<AiReport, 'userId' | 'date' | 'summaryText' | 'weakWords' | 'suggestionText' | 'isDefault'> {
    return {
      userId,
      date,
      summaryText: out.summaryText,
      weakWords: out.weakWords,
      suggestionText: out.suggestionText,
      isDefault: false,
    };
  }

  private toResponse(
    report: Pick<AiReport, 'userId' | 'date' | 'summaryText' | 'weakWords' | 'suggestionText' | 'isDefault'> &
      Partial<Pick<AiReport, 'id' | 'createdAt'>>,
    isDefaultOverride: boolean | undefined,
    mascotExpr: MascotExpression | undefined,
    stats: DailyReportStats | null,
  ): DailyReportResponse {
    // isDefault 优先用报告自身持久化的标志（幂等读回如实返回），未存时退用调用方传入。
    const isDefault = report.isDefault ?? isDefaultOverride ?? false;
    const res: DailyReportResponse = {
      userId: report.userId,
      date: report.date,
      summaryText: report.summaryText,
      weakWords: report.weakWords ?? [],
      suggestionText: report.suggestionText,
      isDefault,
      stats,
    };
    if (report.id) res.id = report.id;
    if (report.createdAt) res.createdAt = report.createdAt.toISOString();
    if (mascotExpr) res.mascotExpr = mascotExpr;
    return res;
  }
}

/** UTC 当日 `YYYY-MM-DD`（与 task_completions.date 口径一致）。 */
function todayUtc(): string {
  return new Date().toISOString().split('T')[0];
}

/** 给定 UTC 日期，返回当日 [起始, 结束] 的 Date 边界（含当日全天）。 */
function dayBounds(date: string): [Date, Date] {
  return [
    new Date(`${date}T00:00:00.000Z`),
    new Date(`${date}T23:59:59.999Z`),
  ];
}
