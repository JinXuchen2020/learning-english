import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AiSpeechAttempt,
  AiSpeechAttemptEntry,
  clampScore,
  sanitizePhonemes,
} from './ai-speech-attempt.entity';
import { logger } from '../common/logger/logger';

/**
 * 口语跟读尝试持久化服务（AI-301，M3 起点）。
 *
 * 把每次跟读尝试（评分 + 弱音素）落 `ai_speech_attempts` 表，供后续
 * AI-306（评分反馈）/ AI-307（历史展示）/ AI-602（难度自适应）消费。
 *
 * 设计原则：**best-effort，绝不阻断主流程**——DB 写失败（磁盘满/连接抖动）
 * 只告警吞异常，绝不让落库拖垮孩子的口语训练（与 AI-108 `AiCallLogService` 同口径）。
 *
 * 作为持久化边界，本服务对 `score` 做钳制兜底（`clampScore`）、对 `weakPhonemes`
 * 做清洗兜底（`sanitizePhonemes`），确保直接调用 `record` 也不会写出越界脏数据。
 */
@Injectable()
export class AiSpeechAttemptService {
  constructor(
    @InjectRepository(AiSpeechAttempt)
    private readonly repo: Repository<AiSpeechAttempt>,
  ) {}

  /** 落库一条口语尝试；任何异常（含 DB 失败）都被吞掉并返回 false，不影响主流程。 */
  async record(entry: AiSpeechAttemptEntry): Promise<boolean> {
    try {
      const row = this.repo.create({
        userId: entry.userId,
        wordId: entry.wordId ?? null,
        sentenceId: entry.sentenceId ?? null,
        audioPath: entry.audioPath,
        score: clampScore(entry.score),
        weakPhonemes: sanitizePhonemes(entry.weakPhonemes),
      });
      await this.repo.save(row);
      return true;
    } catch (err) {
      // 落库失败绝不应影响孩子的口语训练：仅记录告警后继续。
      logger.warn('[AI-SPEECH] 口语尝试落库失败（已忽略，不影响主流程）', {
        userId: entry.userId,
        error: (err as Error)?.message,
      });
      return false;
    }
  }

  /** 按用户取最近 N 条尝试（默认 50），按 `createdAt` 倒序（最新在前）。 */
  async findByUser(userId: string, limit = 50): Promise<AiSpeechAttempt[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
