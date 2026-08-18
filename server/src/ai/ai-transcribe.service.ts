/**
 * AiTranscribeService — STT 转写编排层（AI-304）
 *
 * 调用底层 `SttProvider.transcribe`（SttProvider 内已含 retry，无配置时走 Mock 安全桩），
 * 对**降级 / 失败结果做识别标注**（`degraded` / `degradeReason`），**不抛错**，
 * 供下游消费：
 * - AI-305（发音评分策略）：`degraded` 为真时走「转写文本相似度兜底」评分。
 * - AI-306（评分反馈）：据 `degraded` / 低置信度给低分（呼应 backlog「静音音频返回低分」）。
 *
 * 本服务**不实现底层 STT 网络调用**（真实 STT 端点不在本项目能力内，见 features/ai-304.md §4），
 * 只做**调用编排 + 降级识别**；可测性由 `MockAiProvider.transcribe` 返回确定性转写保证。
 *
 * @module ai/ai-transcribe.service
 */

import { Injectable } from '@nestjs/common';
import {
  AudioInput,
  TranscribeOptions,
  TranscriptResult,
} from './ai-provider.interface';
import { SttProvider } from './stt.provider';
import { classifyTranscript, TranscriptDegradeReason } from './transcribe-result.util';
import { logger } from '../common/logger/logger';

/**
 * 转写产出：底层 {@link TranscriptResult} 扩展降级标注。
 * 类型在 service 内定义，**不污染 `AiProvider` 接口契约（AI-101）**，避免跨 feature 改动接口。
 */
export type TranscriptOutcome = TranscriptResult & {
  /** 是否降级（空转写 / 低置信度 / provider 错误）。 */
  degraded?: boolean;
  /** 降级原因（仅降级时出现）。 */
  degradeReason?: TranscriptDegradeReason;
};

/** STT 转写编排服务。 */
@Injectable()
export class AiTranscribeService {
  constructor(private readonly stt: SttProvider) {}

  /**
   * 转写音频。
   * - provider 抛错 → 返回降级结果（`degraded:'provider_error'`、空文本）**且不抛异常**
   *   （与 AI-102 降级口径一致：降级仅标记不阻断）。
   * - 成功 → 透传 `words` / `durationMs` 时间轴，并合并 `classifyTranscript` 的降级标注。
   * @param audio 音频输入
   * @param opts 可选语言/超时
   * @returns 转写产出 {@link TranscriptOutcome}
   */
  async transcribe(audio: AudioInput, opts?: TranscribeOptions): Promise<TranscriptOutcome> {
    let result: TranscriptResult;
    try {
      result = await this.stt.transcribe(audio, opts);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn(`[AiTranscribeService] stt.transcribe 降级: ${reason}`);
      return {
        text: '',
        confidence: 0,
        durationMs: 0,
        degraded: true,
        degradeReason: 'provider_error',
      };
    }

    const verdict = classifyTranscript({ text: result.text, confidence: result.confidence });
    return {
      ...result,
      degraded: verdict.degraded,
      degradeReason: verdict.reason,
    };
  }
}
