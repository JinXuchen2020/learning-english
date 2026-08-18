/**
 * AI provider 统一错误类型（AI-106 / AI-102 错误分类）。
 *
 * 抽离为独立模块——错误类是跨 provider 共享的契约
 * （retry / audit / quota 均依赖），不应随具体 provider 的移除而消失。
 *
 * @module ai/ai-provider.errors
 */

/**
 * AI provider 抛出的异常，携带可被上层（AI-106 重试/降级）识别的
 * `statusCode` 与 `code`。
 */
export class AiProviderException extends Error {
  /** HTTP 风格状态码（401 鉴权 / 429 限流 / 5xx 接口错误 / 0 网络 / 504 超时 / 502 结构异常）。 */
  readonly statusCode?: number;
  /** Provider 原生错误码（如某些厂商限流码 1305）。 */
  readonly code?: string | number;

  constructor(
    message: string,
    opts?: { statusCode?: number; code?: string | number },
  ) {
    super(message);
    this.name = 'AiProviderException';
    this.statusCode = opts?.statusCode;
    this.code = opts?.code;
  }
}

/**
 * 账户权限类错误（401/403 鉴权失败、NVIDIA `404 Function not found for account` 等）。
 * 区别于瞬时错误：**不重试**，业务层应据此提示用户「检查 key / 账户权限」。
 * 由 AI-106 的错误分类 {@link classifyError} 识别为 `access`。
 */
export class AiAccessError extends AiProviderException {
  constructor(
    message: string,
    opts?: { statusCode?: number; code?: string | number },
  ) {
    super(message, opts);
    this.name = 'AiAccessError';
  }
}
