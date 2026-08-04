import { AiProviderException } from './bigmodel.provider';

/** 配额超限明细，便于上层做降级决策与日志审计。 */
export interface QuotaExceededDetail {
  /** 触发超限的用户。 */
  userId: string;
  /** 统计日期 `YYYY-MM-DD`。 */
  date: string;
  /** 调用次数上限。 */
  callLimit: number;
  /** token 上限。 */
  tokenLimit: number;
  /** 当前已用调用次数。 */
  callCount: number;
  /** 当前已用 token。 */
  tokenCount: number;
}

/**
 * 每日配额耗尽错误（AI-107）。
 *
 * - 继承 `AiProviderException`，HTTP 语义 **429**（Too Many Requests）。
 * - `degraded:true`：业务层据此走降级（返回内置模板 / 缓存结果），而非硬失败。
 * - 由最外层 `UsageLimitedAiProvider` 在调用真实 provider **之前**抛出，
 *   因此**不会**进入 AI-106 的 `withRetry`（重试只针对瞬时网络错误），
 *   避免对配额上限做无意义重试。
 */
export class AiQuotaExceededError extends AiProviderException {
  /** 降级标记：业务层可据此返回友好降级而非崩溃。 */
  readonly degraded = true;
  /** 超限明细，供降级文案与日志使用。 */
  readonly detail: QuotaExceededDetail;

  constructor(message: string, detail: QuotaExceededDetail) {
    super(message, { statusCode: 429, code: 'QUOTA_EXCEEDED' });
    this.name = 'AiQuotaExceededError';
    this.detail = detail;
  }
}
