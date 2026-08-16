import { AsyncLocalStorage } from 'async_hooks';

/**
 * AI provider 请求上下文（AI-705）。
 *
 * 由 `AiProviderContextInterceptor` 在每个请求入口写入「effective parent」，
 * `AiProviderRouter` 在每次 AI 调用时读取，以选择该家长账号配置的默认 provider；
 * 无上下文 / 未配置 → 回退 DB 系统默认 provider（零回归）。
 */
export interface AiProviderContext {
  /** 请求 JWT 解析出的 userId（parent 或 child）。 */
  userId?: string;
  /** 请求 JWT 的角色（'parent' / 缺省=child）。 */
  role?: string;
}

export const aiContextStorage = new AsyncLocalStorage<AiProviderContext>();
