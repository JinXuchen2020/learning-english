import { AiProviderException, AiAccessError } from './ai-provider.errors';
import { logger } from '../common/logger/logger';

/**
 * 错误类别，驱动重试决策（AI-106）：
 * - `retryable`：瞬时错误（网络/超时/429 限流/5xx 网关），应退避重试。
 * - `access`   ：账户权限错误（401/403、NVIDIA 404 Function not found），**不重试**，提示用户。
 * - `permanent`：永久错误（其余 4xx、结构异常 502、未知裸 Error），不重试。
 */
export type ErrorKind = 'retryable' | 'access' | 'permanent';

/**
 * 对 provider 抛出的错误做归一化分类。
 *
 * 注意 BigModel 的 `502` 在本项目语义是「响应结构异常（缺 content）」而非网关
 * 错误，因此判为 `permanent`；真正的网关 5xx（500/501/503/505…）判为 `retryable`。
 *
 * 非 `AiProviderException` 的未知错误一律 `permanent`，避免对裸 `Error` 盲目重试。
 */
export function classifyError(err: unknown): ErrorKind {
  if (err instanceof AiAccessError) return 'access';
  if (err instanceof AiProviderException) {
    const status = err.statusCode;
    if (status === 401 || status === 403) return 'access';
    if (
      status === 404 &&
      (err.code === 'FUNCTION_NOT_FOUND' ||
        /Function not found for account/i.test(err.message))
    ) {
      return 'access';
    }
    if (status === 429) return 'retryable';
    if (status === 0 || status === 504) return 'retryable';
    if (typeof status === 'number' && status >= 500 && status < 600 && status !== 502) {
      return 'retryable';
    }
    return 'permanent';
  }
  return 'permanent';
}

/** 重试配置（均可覆盖，便于测试注入无等待 `delay`）。 */
export interface AiRetryOptions {
  /** 最大尝试次数（含首次），默认 3。 */
  maxAttempts?: number;
  /** 首次退避基准（毫秒），默认 400。 */
  baseDelayMs?: number;
  /** 退避上限（毫秒），默认 8000。 */
  maxDelayMs?: number;
  /** 退避增长因子，默认 2（指数退避）。 */
  factor?: number;
  /** 可注入的延迟函数，默认 `setTimeout`；测试用 no-op 避免真实睡眠。 */
  delay?: (ms: number) => Promise<void>;
}

/** 默认重试配置：3 次、指数退避 400→8000ms。 */
export const DEFAULT_RETRY_OPTIONS: Required<AiRetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 400,
  maxDelayMs: 8000,
  factor: 2,
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * 包裹一次可能失败的网络调用，对**瞬时错误**做指数退避重试：
 * - `retryable` → 退避后重试（最多 `maxAttempts-1` 次）。
 * - `access` / `permanent` → 立即抛出，不重试。
 * - 全部尝试耗尽 → 抛出**最后一次错误**（保留原始 `statusCode`/`code`，可识别）。
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Required<AiRetryOptions> = DEFAULT_RETRY_OPTIONS,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const kind = classifyError(err);
      if (kind !== 'retryable') {
        throw err;
      }
      lastErr = err;
      if (attempt < options.maxAttempts - 1) {
        const delayMs = Math.min(
          options.baseDelayMs * options.factor ** attempt,
          options.maxDelayMs,
        );
        logger.debug(
          `[AI] 第 ${attempt + 1} 次调用失败（${kind}），将在 ${delayMs}ms 后重试`,
        );
        await options.delay(delayMs);
      }
    }
  }
  throw lastErr;
}

/**
 * 把任意错误归一为可识别的 `AiProviderException`：
 * - `access` 类但非 `AiAccessError` → 包装成 `AiAccessError`（保留文案与 statusCode/code）。
 * - 其它 `AiProviderException` → 原样返回。
 * - 裸 `Error` → 包成 `AiProviderException`，避免上层拿到无法识别的类型。
 *
 * 供消费方/未来 NvidiaProvider 使用，确保「权限错误给出明确文案、失败抛可识别异常」。
 */
export function normalizeError(err: unknown): AiProviderException {
  if (err instanceof AiAccessError) return err;
  if (err instanceof AiProviderException) {
    if (classifyError(err) === 'access') {
      return new AiAccessError(err.message, { statusCode: err.statusCode, code: err.code });
    }
    return err;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return new AiProviderException(`AI 调用失败：${msg}`);
}
