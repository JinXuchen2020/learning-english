import { describe, it, expect } from 'vitest';
import { computeLevel, buildLevelInfo, LEVEL_THRESHOLDS, MAX_LEVEL } from './mascotLevel';

describe('mascotLevel', () => {
  it('computeLevel respects thresholds (mirrors backend)', () => {
    expect(computeLevel(0)).toBe(1);
    expect(computeLevel(49)).toBe(1);
    expect(computeLevel(50)).toBe(2);
    expect(computeLevel(119)).toBe(2);
    expect(computeLevel(120)).toBe(3);
    expect(computeLevel(199)).toBe(3);
    expect(computeLevel(200)).toBe(4);
    expect(computeLevel(299)).toBe(4);
    expect(computeLevel(300)).toBe(5);
    expect(computeLevel(499)).toBe(5);
    expect(computeLevel(500)).toBe(6);
    expect(computeLevel(999)).toBe(6);
    expect(computeLevel(-5)).toBe(1);
    expect(computeLevel(NaN)).toBe(1);
  });

  it('buildLevelInfo computes progress', () => {
    const info = buildLevelInfo(130, 3);
    expect(info.levelStars).toBe(10); // 130 - 120
    expect(info.nextLevelStars).toBe(200);
    expect(info.isMaxLevel).toBe(false);
  });

  it('buildLevelInfo at max level', () => {
    const info = buildLevelInfo(999, 6);
    expect(info.isMaxLevel).toBe(true);
    expect(info.nextLevelStars).toBe(999);
  });

  it('MAX_LEVEL matches thresholds length', () => {
    expect(MAX_LEVEL).toBe(LEVEL_THRESHOLDS.length);
  });
});
