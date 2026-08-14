/**
 * 内容安全分类器（AI-406 / AI-713）。
 *
 * 双保险的第二道闸：把用户文本交给系统默认 LLM provider（智谱，经全局
 * `AI_PROVIDER_TOKEN` 注入）做语义二分类为 safe / unsafe，兜住关键词黑名单
 * （第一道闸）漏掉的语义有害内容。
 *
 * AI-713 改造：去除原 NVIDIA NIM 独立 env 依赖，复用已存在的「系统默认智谱
 * provider」做 LLM 安全判断，避免再维护一套 NVIDIA key（fail-open 兜底）。
 *
 * 设计取舍 —— **fail-open（降级放行）**：安全服务异常时，优先保证对话可用，
 * 因为第一道关键词黑名单仍是硬闸。具体两种 fail-open：
 *   1) provider 未注入 / 调用抛错 → 放行 + warn；
 *   2) 模型返回非预期（无法判定 safe）→ 视为安全放行 + warn。
 *
 * `classify(text)` 返回 `true`=安全（放行），`false`=不安全（拦截）。
 *
 * @module chat/chat-safety.classifier
 */

import { AiProvider, ChatMessage } from '../ai/ai-provider.interface';
import { logger } from '../common/logger/logger';

/** 内容安全分类器契约：把文本判为安全/不安全。 */
export interface SafetyClassifier {
  /** @returns true=安全（放行），false=不安全（拦截）。 */
  classify(text: string): Promise<boolean>;
}

/** 安全分类系统提示：要求模型只回单个词 safe / unsafe（nemoguard 约定）。 */
const SAFETY_SYSTEM_PROMPT = [
  'You are a content-safety classifier for a children\'s English-learning chat.',
  'Decide whether the user message is safe for a child to see.',
  'Respond with exactly one word: "safe" or "unsafe".',
  'Do not add any explanation, punctuation beyond the single word, or other text.',
].join(' ');

/**
 * 基于系统默认 LLM provider 的内容安全分类器（AI-713）。
 *
 * 复用全局 `AI_PROVIDER_TOKEN`（系统默认智谱 provider，已套重试/配额/日志链）
 * 做语义二分类，无需独立 env。仅做文本二分类，不做对话；
 * 读 `choices[0].message.content` 是否含 `unsafe`。
 */
export class LlmSafetyClassifier implements SafetyClassifier {
  private warnedNoProvider = false;

  constructor(private readonly provider: AiProvider) {}

  async classify(text: string): Promise<boolean> {
    if (!this.provider) {
      if (!this.warnedNoProvider) {
        this.warnedNoProvider = true;
        logger.warn(
          '[Safety] 内容安全分类器未注入 provider，降级为放行（仅关键词黑名单生效）',
        );
      }
      return true;
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: SAFETY_SYSTEM_PROMPT },
      { role: 'user', content: text },
    ];

    let content: string;
    try {
      const res = await this.provider.chat(messages, { maxTokens: 8, temperature: 0 });
      content = (res?.text ?? '').trim();
    } catch (e) {
      // LLM 调用异常 → fail-open 放行，黑名单仍是硬闸。
      logger.warn(
        `[Safety] LLM 安全分类请求失败，fail-open 放行：${(e as Error)?.message ?? 'unknown'}`,
      );
      return true;
    }

    // 含 "unsafe"（不区分大小写）→ 不安全（拦截）。
    return !/unsafe/i.test(content);
  }
}
