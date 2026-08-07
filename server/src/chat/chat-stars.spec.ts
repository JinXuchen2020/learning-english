import { computeStars, CHAT_STAR_ROUNDS } from './chat-stars';

/**
 * computeStars 纯逻辑单测（AI-408）。
 * 不依赖 DB：rounds = 对话轮数（用户发言条数），stars = floor(rounds / 8)。
 */

describe('computeStars (AI-408)', () => {
  it('默认阈值常量 = 8 轮', () => {
    expect(CHAT_STAR_ROUNDS).toBe(8);
  });

  it('0 轮 → 0 星，不获奖，距下颗 8 轮', () => {
    expect(computeStars(0, 0)).toEqual({
      stars: 0,
      starAwarded: false,
      starsUntilNext: 8,
    });
  });

  it('7 轮 → 0 星，不获奖，距下颗 1 轮', () => {
    expect(computeStars(7, 0)).toEqual({
      stars: 0,
      starAwarded: false,
      starsUntilNext: 1,
    });
  });

  it('正好 8 轮 → 第 1 颗星，starAwarded=true，距下颗 8 轮', () => {
    expect(computeStars(8, 0)).toEqual({
      stars: 1,
      starAwarded: true,
      starsUntilNext: 8,
    });
  });

  it('9 轮（已持有 1 星）→ 不获奖，距下颗 7 轮', () => {
    expect(computeStars(9, 1)).toEqual({
      stars: 1,
      starAwarded: false,
      starsUntilNext: 7,
    });
  });

  it('15 轮（已持有 1 星）→ 不获奖，距下颗 1 轮', () => {
    expect(computeStars(15, 1)).toEqual({
      stars: 1,
      starAwarded: false,
      starsUntilNext: 1,
    });
  });

  it('16 轮（已持有 1 星）→ 第 2 颗星，starAwarded=true', () => {
    expect(computeStars(16, 1)).toEqual({
      stars: 2,
      starAwarded: true,
      starsUntilNext: 8,
    });
  });

  it('已持有 1 星时再达 8 轮（共 8）→ 不再获奖（无重复发星）', () => {
    expect(computeStars(8, 1)).toEqual({
      stars: 1,
      starAwarded: false,
      starsUntilNext: 8,
    });
  });

  it('已持有 1 星时达 16 轮 → 第 2 颗星', () => {
    expect(computeStars(16, 1)).toEqual({
      stars: 2,
      starAwarded: true,
      starsUntilNext: 8,
    });
  });

  it('负数轮数 → 安全归零', () => {
    expect(computeStars(-3, 0).stars).toBe(0);
  });

  it('小数轮数 → 向下取整', () => {
    expect(computeStars(2.5, 0)).toEqual({
      stars: 0,
      starAwarded: false,
      starsUntilNext: 6,
    });
  });
});
