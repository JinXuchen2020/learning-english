import { Injectable } from '@nestjs/common';
import { AudioInput, AssessOptions, ScoreResult } from './ai-provider.interface';
import { AiPronunciationScorerService } from './ai-pronunciation-scorer.service';

/**
 * PronunciationProvider（AI-重构：以能力命名）。
 *
 * 发音评测是**复合能力** = 转写(SttProvider) + LLM 评估(ChatProvider) + 相似度兜底，
 * 由 `AiPronunciationScorerService` 统一编排。本 provider 不直接持有配置，而是复用
 * 底层 `SttProvider` / `ChatProvider` 各自加载的配置（即「provider 里去加载配置」
 * 由子能力 provider 完成），自身只做能力聚合与对外暴露。
 *
 * @module ai/pronunciation.provider
 */
@Injectable()
export class PronunciationProvider {
  get name(): string {
    return 'PronunciationProvider';
  }

  constructor(private readonly scorer: AiPronunciationScorerService) {}

  async assessPronunciation(
    audio: AudioInput,
    referenceText: string,
    options?: AssessOptions,
  ): Promise<ScoreResult> {
    return this.scorer.score({ audio, referenceText, opts: options });
  }
}
