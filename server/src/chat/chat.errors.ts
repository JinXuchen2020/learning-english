/**
 * 对话陪练业务错误（AI-403）。
 *
 * 携带 HTTP `status` 与机器可读 `code`，由 `ChatController` 翻译为
 * `HttpException`，保持 service 层对 Nest 传输层零依赖（便于 node 单测）。
 *
 * 错误分类映射参考 `AiProviderException`（provider 链统一异常）：
 * - 429 限流 → `AI_RATE_LIMITED`
 * - 401/403 访问/权限 → `AI_UNAVAILABLE`
 * - 其它（网络/超时/结构异常/未知）→ `AI_GENERATION_FAILED`
 */
export class ChatError extends Error {
  /** HTTP 状态码。 */
  readonly status: number;
  /** 机器可读错误码（前端据此提示）。 */
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ChatError';
    this.status = status;
    this.code = code;
  }
}
