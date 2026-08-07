/**
 * 内容安全服务（AI-406，双保险编排）。
 *
 * 串联两道闸门对用户输入做安全检查：
 *   1. 关键词黑名单（`matchBlocklist`，同步、必然生效）— 命中即拦；
 *   2. NVIDIA 语义分类器（`SafetyClassifier.classify`，异步）— 兜住语义有害内容。
 * 任一命中 → `{ safe:false, reason }`；均通过 → `{ safe:true }`。
 *
 * 分类器异常在内部 fail-open（放行），由 `logger.warn` 记录，不向外抛——
 * 黑名单仍是硬闸，避免安全服务抖动时阻断正常对话。
 *
 * @module chat/chat-safety.service
 */

import { Inject, Injectable } from '@nestjs/common';
import { SafetyClassifier } from './chat-safety.classifier';
import { matchBlocklist } from './chat-safety.config';
import { logger } from '../common/logger/logger';

/** 安全判定结果。 */
export interface SafetyVerdict {
  /** 是否安全（可放行给 LLM）。 */
  safe: boolean;
  /** 命中来源：`blocklist` / `classifier`；安全为 undefined。 */
  reason?: 'blocklist' | 'classifier';
}

/** 注入 token：业务模块经此注入 `SafetyClassifier` 实现（便于测试替换）。 */
export const SAFETY_CLASSIFIER_TOKEN = 'CHAT_SAFETY_CLASSIFIER';

@Injectable()
export class ChatSafetyService {
  constructor(@Inject(SAFETY_CLASSIFIER_TOKEN) private readonly classifier: SafetyClassifier) {}

  /**
   * 双保险检查用户输入。
   * @param text 用户发言文本（已通过基础校验，可能为空/含注入尝试）
   * @returns 安全判定；黑名单优先于分类器（命中黑名单不再调分类器，省一次网络）
   */
  async checkUserInput(text: string): Promise<SafetyVerdict> {
    const blocked = matchBlocklist(text);
    if (blocked) {
      return { safe: false, reason: 'blocklist' };
    }

    let classifiedSafe: boolean;
    try {
      classifiedSafe = await this.classifier.classify(text);
    } catch (e) {
      // 分类器异常 → fail-open 放行，黑名单仍为硬闸。
      logger.warn(
        `[ChatSafety] 分类器异常，fail-open 放行：${(e as Error)?.message ?? 'unknown'}`,
      );
      classifiedSafe = true;
    }

    if (!classifiedSafe) {
      return { safe: false, reason: 'classifier' };
    }
    return { safe: true };
  }
}
