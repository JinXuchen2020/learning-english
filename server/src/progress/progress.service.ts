import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LessonProgress } from '../entities/lesson-progress.entity';
import { WordProgress, WordDifficulty } from '../entities/word-progress.entity';
import { User } from '../entities/user.entity';
import { computeLevel } from '../ai/mascot-level.util';

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

    await this.wordProgressRepo.save(progress);

    return {
      success: true,
      attempts: progress.attempts,
      correctCount: progress.correctCount,
      mastery: progress.mastery,
      difficulty: progress.difficulty,
    };
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
