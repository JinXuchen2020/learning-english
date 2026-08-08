import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LessonProgress } from '../entities/lesson-progress.entity';
import { WordProgress, WordDifficulty } from '../entities/word-progress.entity';
import { User } from '../entities/user.entity';
import { computeLevel } from '../ai/mascot-level.util';
import { computeNextReview, loadReviewIntervals } from './review-schedule.util';

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
  ) {}

  async getOverview(userId: string) {
    const completedLessons = await this.lessonProgressRepo.count({
      where: { userId, completed: true },
    });
    const practicedWords = await this.wordProgressRepo.count({
      where: { userId },
    });
    const user = await this.usersRepo.findOne({ where: { id: userId } });

    return {
      completedLessons,
      practicedWords,
      totalStars: user?.totalStars || 0,
      streakDays: user?.streakDays || 0,
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

    // Award star
    await this.usersRepo.increment({ id: userId }, 'totalStars', 1);

    // AI-603: 重算等级（等级由累计星星推导，唯一写入点更新，保证与 totalStars 一致）
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (user) {
      const newLevel = computeLevel(user.totalStars);
      if (newLevel !== (user.level ?? 1)) {
        await this.usersRepo.update({ id: userId }, { level: newLevel });
      }
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
}
