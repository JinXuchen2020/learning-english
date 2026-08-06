import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Word } from '../entities/word.entity';
import { ScoreResult } from './ai-provider.interface';
import { EvaluateSpeechDto } from './speech-evaluate.dto';
import {
  SpeechEvaluateError,
  validateSpeechUpload,
} from './speech-evaluate.validation';
import { AiPronunciationScorerService } from './ai-pronunciation-scorer.service';

/**
 * 上传音频文件的最小结构（避免依赖 `@types/multer`，仓内未安装）。
 * multer 产出的 `Express.Multer.File` 在运行时满足该结构。
 */
export interface UploadedAudioFile {
  /** 文件二进制。 */
  buffer: Buffer;
  /** MIME 类型。 */
  mimetype: string;
  /** 字节数。 */
  size: number;
  /** 原始文件名。 */
  originalname?: string;
}

/** `evaluate` 入参。 */
export interface EvaluateSpeechCommand {
  /** 上传的音频文件（来自 multer `FileInterceptor('audio')`）。 */
  file: UploadedAudioFile;
  /** 解析后的请求体。 */
  dto: EvaluateSpeechDto;
}

/**
 * 口语评测服务（AI-303）。
 *
 * 职责：**上传校验**（大小/格式/时长）→ **参考文本解析**（wordId/sentenceId/直传）
 * → 委托 `AiPronunciationScorerService`（AI-305）统一评分策略（首选 phoneme / 无 Azure 兜底相似度）。
 * 本 feature **不落库**（持久化属 AI-306，消费 AI-301 `ai_speech_attempts` 实体），严守边界。
 *
 * 评分算法细节（STT 转写 / Azure 音素级 / 相似度兜底）下沉到 AI-305 的 scorer，
 * 本服务只负责请求编排与参考文本解析，符合 AI-101 抽象。
 */
@Injectable()
export class AiSpeechEvaluatorService {
  constructor(
    @InjectRepository(Word)
    private readonly wordRepo: Repository<Word>,
    private readonly scorer: AiPronunciationScorerService,
  ) {}

  /**
   * 评测一次口语录音。
   * @returns 评分结果 {@link ScoreResult}
   * @throws SpeechEvaluateError 校验/解析失败时（status+code 供 controller 翻译）
   */
  async evaluate(cmd: EvaluateSpeechCommand): Promise<ScoreResult> {
    const { file, dto } = cmd;

    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new SpeechEvaluateError(400, 'NO_AUDIO', '缺少录音文件');
    }

    validateSpeechUpload({
      size: file.size,
      mimeType: file.mimetype,
      durationMs: dto.durationMs,
    });

    const referenceText = await this.resolveReferenceText(dto);

    return this.scorer.score({
      audio: { data: file.buffer, mimeType: file.mimetype },
      referenceText,
      opts: { passLine: 60 },
    });
  }

  /**
   * 解析评分参考文本（目标读音）。优先级：直传 `referenceText` → `wordId` 查 Word.text
   * → `sentenceId`（句库未落地）→ 全缺。
   * @throws SpeechEvaluateError 解析失败时
   */
  private async resolveReferenceText(dto: EvaluateSpeechDto): Promise<string> {
    if (dto.referenceText && dto.referenceText.trim().length > 0) {
      return dto.referenceText.trim();
    }

    if (dto.wordId) {
      const word = await this.wordRepo.findOne({ where: { id: dto.wordId } });
      if (!word) {
        throw new SpeechEvaluateError(404, 'WORD_NOT_FOUND', '单词不存在');
      }
      return word.text;
    }

    if (dto.sentenceId) {
      // 句库（AI-309）尚未落地，无 Sentence 实体；显式返回 400 而非静默失败。
      throw new SpeechEvaluateError(
        400,
        'SENTENCE_SCORING_NOT_READY',
        '句子跟读评分尚未开放（句库待上线）',
      );
    }

    throw new SpeechEvaluateError(
      400,
      'MISSING_REFERENCE',
      '需提供 wordId / sentenceId / referenceText 之一',
    );
  }
}
