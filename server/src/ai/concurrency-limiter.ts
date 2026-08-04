/**
 * 简单 Promise 信号量，限制同时执行的异步任务数量。
 *
 * 用于 AI-106 的「降低并发」：对 `chat`/`chatWithImage` 这类真实网络调用做并发上限
 * 保护，避免自伤式触发 provider `429` 限流。固定上限由 `max` 指定；自适应收缩
 * （命中 429 后动态调小 `max`）留作后续增强。
 */
export class ConcurrencyLimiter {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number = 4) {
    if (max < 1) {
      throw new Error('ConcurrencyLimiter.max 必须 >= 1');
    }
  }

  /** 在并发额度内执行 `fn`，超额时排队等待空闲额度。 */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }

  private release(): void {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) {
      this.active += 1;
      next();
    }
  }
}
