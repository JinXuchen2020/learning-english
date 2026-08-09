import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LessonProgress } from '../entities/lesson-progress.entity';
import { WordProgress, WordDifficulty } from '../entities/word-progress.entity';
import { User } from '../entities/user.entity';
import { StudyPlanDay } from '../plan/study-plan-day.entity';
import { computeLevel } from '../ai/mascot-level.util';
import { computeNextReview, loadReviewIntervals } from './review-schedule.util';
import { RewardsService } from '../rewards/rewards.service';
import { POINT_RULES } from '../rewards/points.const';
import { logger } from '../common/logger/logger';
import {
  filterWeakWords,
  mapMissedTasks,
  yesterdayBounds,
  toUtcDate,
  MakeupQueue,
  WeakWordRow,
  MissedTaskRow,
} from './makeup.util';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 掌握度 0-100 = round(correctCount / attempts * 100)。
 * 未练（attempts=0）返回 0。
 */
export function computeMastery(attempts: number, correctCount: number): number {
  if (!attempts || attempts <= 0) return 0;
  return Math.round((correctCount / attempts) * 100);
}

/**
 * 根据掌握度与练习次数推导自适应难度档位（AI-602）。
 * 需至少 3 次练习才有足够样本调整档位，避免过早升级：
 * - 高正确率（>=80%）且练过 >=3 次 → hard（升级）
 * - 中等正确率（>=50%）且练过 >=3 次 → medium
 * - 其余（练习 <3 次或掌握度 <50%）→ easy
 */
export function computeDifficulty(mastery: number, attempts: number): WordDifficulty {
  if (attempts >= 3 && mastery >= 80) return 'hard';
  if (attempts >= 3 && mastery >= 50) return 'medium';
  return 'easy';
}

/**
 * 复习优先级：值越大越需要复习。
 * = (100 - mastery) + 距上次练习的天数 * 5。
 * 未练过（lastPracticedAt 缺失）→ 视为很久没练，给较高基础权重，但自由练习只排已练词。
 */
export function computeReviewPriority(mastery: number, lastPracticedAt?: Date | null): number {
  let daysSince = 0;
  if (lastPracticedAt) {
    daysSince = Math.max(0, Math.floor((Date.now() - new Date(lastPracticedAt).getTime()) / DAY_MS));
  } else {
    daysSince = 14; // 未练过：默认当作两周未碰，弱权重但偏前
  }
  return 100 - mastery + daysSince * 5;
}

export interface WordDifficultyInfo {
  wordId: string;
  difficulty: WordDifficulty;
  mastery: number;
  reviewPriority: number;
}

/** 单个到期复习单词（AI-605，`GET /progress/review/due` 响应项）。 */
export interface DueReview {
  wordId: string;
  wordText: string;
  meaning: string;
  /** 下次复习到期日 ISO 字符串。 */
  dueDate: string;
  /** 复习优先级（越大越该先复习），复用 AI-602 公式。 */
  reviewPriority: number;
  difficulty: WordDifficulty;
  /** 当前间隔天数。 */
  intervalDays: number;
}

@Injectable()
export class ProgressService {
  constructor(
    @InjectRepository(LessonProgress)
    private lessonProgressRepo: Repository<LessonProgress>,
    @InjectRepository(WordProgress)
    private wordProgressRepo: Repository<WordProgress>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectRepository(StudyPlanDay)
    private studyPlanDayRepo: Repository<StudyPlanDay>,
    private readonly rewardsService: RewardsService,
  ) {}

  async getOverview(userId: string) {
    const completedLessons = await this.lessonProgressRepo.count({
      where: { userId, completed: true },
    });
    const practicedWords = await this.wordProgressRepo.count({
      where: { userId },
    });
    const user = await this.usersRepo.findOne({ where: { id: userId } });

    let pointsBalance = 0;
    try {
      pointsBalance = await this.rewardsService.getBalance(userId);
    } catch (err) {
      logger.warn('[PROGRESS] 获取积分余额失败（降级 0）', err as Error);
    }

    return {
      completedLessons,
      practicedWords,
      totalStars: user?.totalStars || 0,
      streakDays: user?.streakDays || 0,
      level: user ? computeLevel(user.totalStars || 0) : 1,
      pointsBalance,
    };
  }

  async completeLesson(userId: string, lessonId: string) {
    let progress = await this.lessonProgressRepo.findOne({
      where: { userId, lessonId },
    });

    if (!progress) {
      progress = this.lessonProgressRepo.create({ userId, lessonId });
    }
    progress.completed = true;
    progress.completedAt = new Date();
    await this.lessonProgressRepo.save(progress);

    // AI-603/AI-701: 统一累加星星 + 等级 + 积分（经 RewardsService 单一入口，best-effort）。
    try {
      await this.rewardsService.awardStars(userId, POINT_RULES.LESSON_COMPLETE);
    } catch (err) {
      logger.warn('[PROGRESS] 完成课程累加积分失败（不影响主流程）', err as Error);
    }

    return { success: true };
  }

  async recordWordAttempt(userId: string, wordId: string, correct: boolean) {
    let progress = await this.wordProgressRepo.findOne({
      where: { userId, wordId },
    });

    if (!progress) {
      progress = this.wordProgressRepo.create({
        userId,
        wordId,
        attempts: 0,
        correctCount: 0,
        difficulty: 'easy',
        mastery: 0,
      });
    }

    progress.attempts += 1;
    if (correct) progress.correctCount += 1;
    progress.lastPracticedAt = new Date();

    // AI-602: 自适应难度档位 + 掌握度
    progress.mastery = computeMastery(progress.attempts, progress.correctCount);
    progress.difficulty = computeDifficulty(progress.mastery, progress.attempts);

    // AI-605: 间隔重复——根据本次正确与否推导下次复习到期日/间隔/易化因子。
    const intervals = loadReviewIntervals();
    const review = computeNextReview({
      correct,
      prevIntervalDays: progress.intervalDays,
      prevEaseFactor: progress.easeFactor,
      prevReviewCount: progress.reviewCount,
      now: new Date(),
      intervals,
    });
    progress.intervalDays = review.intervalDays;
    progress.easeFactor = review.easeFactor;
    progress.reviewCount = review.reviewCount;
    progress.dueDate = review.dueDate;

    await this.wordProgressRepo.save(progress);

    // AI-701: 答对单词累加积分（best-effort，不影响掌握度写入）。
    if (correct) {
      try {
        await this.rewardsService.awardStars(userId, POINT_RULES.WORD_CORRECT);
      } catch (err) {
        logger.warn('[PROGRESS] 答对单词累加积分失败（不影响主流程）', err as Error);
      }
    }

    return {
      success: true,
      attempts: progress.attempts,
      correctCount: progress.correctCount,
      mastery: progress.mastery,
      difficulty: progress.difficulty,
    };
  }

  /**
   * AI-605: 返回某用户「到期/今日待复习」单词（dueDate <= date 且非空），
   * leftJoin Word 取文本/释义，按 dueDate 升序（最紧急在前）。date 缺省为当前时刻。
   */
  async getDueReviews(userId: string, date: Date = new Date()): Promise<DueReview[]> {
    const rows = await this.wordProgressRepo
      .createQueryBuilder('wp')
      .leftJoinAndSelect('wp.word', 'word')
      .where('wp.userId = :userId', { userId })
      .andWhere('wp.dueDate IS NOT NULL')
      .andWhere('wp.dueDate <= :date', { date })
      .orderBy('wp.dueDate', 'ASC')
      .getMany();

    return rows.map((r) => ({
      wordId: r.wordId,
      wordText: r.word?.text ?? '',
      meaning: r.word?.meaning ?? '',
      dueDate: r.dueDate ? r.dueDate.toISOString() : '',
      reviewPriority: computeReviewPriority(r.mastery, r.lastPracticedAt),
      difficulty: r.difficulty,
      intervalDays: r.intervalDays,
    }));
  }

  /** AI-605: 当前生效的复习节奏配置（间隔阶梯可经 `REVIEW_INTERVALS` 环境变量配置）。 */
  getReviewSettings() {
    return { enabled: true, intervals: loadReviewIntervals() };
  }

  /**
   * AI-605: 手动调整某词的下一个复习时间（家长/老师可把词推到明天或提前）。
   * 仅允许操作自己 userId 下的词；不存在返回 null（由 controller 转 404）。
   */
  async scheduleReview(userId: string, wordId: string, dueDate: Date): Promise<WordProgress | null> {
    const progress = await this.wordProgressRepo.findOne({ where: { userId, wordId } });
    if (!progress) return null;
    progress.dueDate = dueDate;
    return this.wordProgressRepo.save(progress);
  }

  /** 返回当前用户所有已练单词的自适应画像，按复习优先级降序（弱词在前）。 */
  async getWordDifficulties(userId: string): Promise<WordDifficultyInfo[]> {
    const rows = await this.wordProgressRepo.find({ where: { userId } });
    return rows
      .map((r) => ({
        wordId: r.wordId,
        difficulty: r.difficulty,
        mastery: r.mastery,
        reviewPriority: computeReviewPriority(r.mastery, r.lastPracticedAt),
      }))
      .sort((a, b) => b.reviewPriority - a.reviewPriority);
  }

  /**
   * AI-704: 补学队列 = 「昨日」学习状态的实时视图（不入新表）。
   * - 昨日未掌握弱词：`word_progress.lastPracticedAt` 落于昨日 UTC 整天 且 mastery < 阈值
   * - 昨日未完成计划日：`study_plan_days.date = 昨日` 且 `isDone=false`
   * 与 AI-605 到期复习去重：弱词若已出现在今日到期复习则不重复展示（避免双入口）。
   */
  async getMakeupQueue(userId: string): Promise<MakeupQueue> {
    const today = new Date();
    const [yStart, yEnd] = yesterdayBounds(today);
    const yesterdayStr = toUtcDate(new Date(today.getTime() - DAY_MS));

    // 1) 昨日弱词候选：DB 层先按昨日时间窗收窄，纯函数再做阈值/去重/排序。
    const wpRows = await this.wordProgressRepo
      .createQueryBuilder('wp')
      .leftJoinAndSelect('wp.word', 'word')
      .where('wp.userId = :userId', { userId })
      .andWhere('wp.lastPracticedAt >= :yStart', { yStart })
      .andWhere('wp.lastPracticedAt < :yEnd', { yEnd })
      .getMany();

    const weakRows: WeakWordRow[] = wpRows.map((r) => ({
      wordId: r.wordId,
      wordText: r.word?.text ?? null,
      meaning: r.word?.meaning ?? null,
      mastery: r.mastery,
      lastPracticedAt: r.lastPracticedAt,
    }));

    // 2) 与 AI-605 到期复习去重（同一词只在一处出现）。
    let dueWordIds = new Set<string>();
    try {
      const due = await this.getDueReviews(userId);
      dueWordIds = new Set(due.map((d) => d.wordId));
    } catch (err) {
      logger.warn('[PROGRESS] 补学队列获取到期复习失败（不去重）', err as Error);
    }
    const weakWords = filterWeakWords(weakRows, dueWordIds, { today });

    // 3) 昨日未完成计划日（经 planId → StudyPlan.userId 归属过滤）。
    const missedRows = await this.studyPlanDayRepo
      .createQueryBuilder('spd')
      .leftJoinAndSelect('spd.plan', 'plan')
      .where('plan.userId = :userId', { userId })
      .andWhere('spd.date = :yesterday', { yesterday: yesterdayStr })
      .andWhere('spd.isDone = :isDone', { isDone: false })
      .getMany();

    const missedTaskRows: MissedTaskRow[] = missedRows.map((r) => ({
      id: r.id,
      title: r.title,
      date: r.date,
    }));
    const missedTasks = mapMissedTasks(missedTaskRows);

    return { weakWords, missedTasks };
  }

  /**
   * AI-704: 标记昨日未完成计划日为已完成（补学回写完成态）。
   * 仅允许操作本人计划；已完成的幂等返回 success（不再重复计分）；
   * 不存在 / 越权返回 `success:false`。计分经 RewardsService 单一入口（best-effort）。
   */
  async completeMakeupTask(
    userId: string,
    planDayId: string,
  ): Promise<{ success: boolean; reason?: string; alreadyDone?: boolean }> {
    const day = await this.studyPlanDayRepo
      .createQueryBuilder('spd')
      .leftJoinAndSelect('spd.plan', 'plan')
      .where('spd.id = :id', { id: planDayId })
      .getOne();

    if (!day) return { success: false, reason: 'not_found' };
    if (day.plan?.userId !== userId) return { success: false, reason: 'forbidden' };
    if (day.isDone) return { success: true, alreadyDone: true };

    day.isDone = true;
    await this.studyPlanDayRepo.save(day);

    try {
      await this.rewardsService.awardStars(userId, POINT_RULES.TASK_COMPLETE);
    } catch (err) {
      logger.warn('[PROGRESS] 补学标记完成累加积分失败（不影响主流程）', err as Error);
    }

    return { success: true };
  }
}
