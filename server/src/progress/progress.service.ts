import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LessonProgress } from '../entities/lesson-progress.entity';
import { WordProgress } from '../entities/word-progress.entity';
import { User } from '../entities/user.entity';

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

    return { success: true };
  }

  async recordWordAttempt(userId: string, wordId: string, correct: boolean) {
    let progress = await this.wordProgressRepo.findOne({
      where: { userId, wordId },
    });

    if (!progress) {
      progress = this.wordProgressRepo.create({ userId, wordId, attempts: 0, correctCount: 0 });
    }

    progress.attempts += 1;
    if (correct) progress.correctCount += 1;
    progress.lastPracticedAt = new Date();
    await this.wordProgressRepo.save(progress);

    return { success: true, attempts: progress.attempts, correctCount: progress.correctCount };
  }
}
