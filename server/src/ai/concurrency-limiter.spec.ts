import { ConcurrencyLimiter } from './concurrency-limiter';

describe('ConcurrencyLimiter', () => {
  it('rejects max < 1', () => {
    expect(() => new ConcurrencyLimiter(0)).toThrow();
  });

  it('runs tasks sequentially under the concurrency cap', async () => {
    const limiter = new ConcurrencyLimiter(2);
    let active = 0;
    let maxObserved = 0;
    const task = () =>
      limiter.run(async () => {
        active += 1;
        maxObserved = Math.max(maxObserved, active);
        await new Promise((r) => setTimeout(r, 10));
        active -= 1;
      });

    await Promise.all([task(), task(), task(), task()]);

    expect(maxObserved).toBeLessThanOrEqual(2);
    expect(active).toBe(0);
  });

  it('resolves all queued tasks eventually', async () => {
    const limiter = new ConcurrencyLimiter(1);
    const order: number[] = [];
    const make = (n: number) => limiter.run(async () => { order.push(n); });
    await Promise.all([make(1), make(2), make(3)]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('releases and propagates the return value', async () => {
    const limiter = new ConcurrencyLimiter(1);
    const res = await limiter.run(async () => 42);
    expect(res).toBe(42);
  });

  it('still releases the slot when the task rejects', async () => {
    const limiter = new ConcurrencyLimiter(1);
    await expect(
      limiter.run(async () => {
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');
    // 槽位已释放，下一个任务可立即执行
    await expect(limiter.run(async () => 'ok')).resolves.toBe('ok');
  });
});
