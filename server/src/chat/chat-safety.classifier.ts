/**
 * 内容安全分类器（AI-406）。
 *
 * 双保险的第二道闸：把用户文本交给 NVIDIA NIM 的 `nvidia/llama-3.1-nemoguard-8b-content-safety`
 * 二分类为 safe / unsafe，兜住关键词黑名单（第一道闸）漏掉的语义有害内容。
 *
 * 设计取舍 —— **fail-open（降级放行）**：安全服务未接入或异常时，优先保证对话可用，
 * 因为第一道关键词黑名单仍是硬闸。具体三种 fail-open：
 *   1) `NVIDIA_API_KEY` 未配置 → 放行 + 打一次告警；
 *   2) HTTP 非 2xx → 放行 + warn；
 *   3) 网络/超时/解析异常 → 放行 + warn。
 *
 * `classify(text)` 返回 `true`=安全（放行），`false`=不安全（拦截）。
 *
 * 与 `BigModelProvider` 同构：构造可注入 `FetchFn` 便于单测用假 fetch 验证请求构造与解析。
 *
 * @module chat/chat-safety.classifier
 */

import { logger } from '../common/logger/logger';

/** 内容安全分类器契约：把文本判为安全/不安全。 */
export interface SafetyClassifier {
  /** @returns true=安全（放行），false=不安全（拦截）。 */
  classify(text: string): Promise<boolean>;
}

/** fetch 注入点（结构子集，满足本分类器所需）。 */
export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
}>;

/** NVIDIASafetyClassifier 构造配置。 */
export interface NvidiaSafetyConfig {
  /** NVIDIA NIM API key。缺省读 `process.env.NVIDIA_API_KEY`。 */
  apiKey?: string;
  /** NVIDIA NIM base URL。缺省 `process.env.NVIDIA_BASE_URL` 或官方默认值。 */
  baseUrl?: string;
  /** 安全模型 id。缺省 `process.env.NVIDIA_SAFETY_MODEL` 或 nemoguard 默认。 */
  model?: string;
  /** 单次分类超时（毫秒）。缺省 10000。 */
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_MODEL = 'nvidia/llama-3.1-nemoguard-8b-content-safety';
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * NVIDIA NIM 内容安全分类器实现。
 *
 * 仅做文本二分类，不做对话；请求按 nemoguard content-safety 约定
 * （user=待检文本，assistant=空），读 `choices[0].message.content` 是否含 `unsafe`。
 */
export class NvidiaSafetyClassifier implements SafetyClassifier {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: FetchFn;
  private warnedNoKey = false;

  constructor(
    config: NvidiaSafetyConfig = {},
    fetchFn: FetchFn = globalThis.fetch.bind(globalThis) as unknown as FetchFn,
  ) {
    this.apiKey = config.apiKey ?? process.env.NVIDIA_API_KEY ?? '';
    this.baseUrl = (
      config.baseUrl ?? process.env.NVIDIA_BASE_URL ?? DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
    this.model = config.model ?? process.env.NVIDIA_SAFETY_MODEL ?? DEFAULT_MODEL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchFn = fetchFn;
  }

  async classify(text: string): Promise<boolean> {
    // 未配置 key：降级 fail-open，仅黑名单生效（避免无 key 时全站被拦）。
    if (!this.apiKey) {
      if (!this.warnedNoKey) {
        this.warnedNoKey = true;
        logger.warn(
          '[Safety] NVIDIA_API_KEY 未配置，内容安全分类器降级为放行（仅关键词黑名单生效）',
        );
      }
      return true;
    }

    const body = {
      model: this.model,
      messages: [
        { role: 'user', content: text },
        { role: 'assistant', content: '' },
      ],
      max_tokens: 8,
      temperature: 0,
    };

    let res: Awaited<ReturnType<FetchFn>>;
    try {
      res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      // 网络/超时（AbortError）→ fail-open 放行，黑名单仍是硬闸。
      logger.warn(
        `[Safety] NVIDIA 安全分类请求失败，fail-open 放行：${(e as Error)?.message ?? 'unknown'}`,
      );
      return true;
    }

    if (!res.ok) {
      logger.warn(`[Safety] NVIDIA 安全分类返回 ${res.status}，fail-open 放行`);
      return true;
    }

    try {
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content: string = data?.choices?.[0]?.message?.content ?? '';
      // 含 "unsafe"（不区分大小写）→ 不安全（拦截）。
      return !/unsafe/i.test(content.trim());
    } catch (e) {
      logger.warn(
        `[Safety] NVIDIA 安全分类响应解析失败，fail-open 放行：${(e as Error)?.message ?? 'unknown'}`,
      );
      return true;
    }
  }
}
