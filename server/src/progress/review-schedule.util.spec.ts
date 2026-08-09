import {
  computeNextReview,
  loadReviewIntervals,
  DEFAULT_REVIEW_INTERVALS,
  EASE_FACTOR_MIN,
  EASE_FACTOR_MAX,
} from './review-schedule.util';

const DAY_MS = 24 * 60 * 60 * 1000;
const FIXED_NOW = new Date('2026-08-09T12:00:00.000Z');

describe('review-schedule.util (AI-605)', () => {
  describe('loadReviewIntervals', () => {
    const ORIG = process.env.REVIEW_INTERVALS;
    afterEach(() => {
      if (ORIG === undefined) delete process.env.REVIEW_INTERVALS;
      else process.env.REVIEW_INTERVALS = ORIG;
    });

    it('returns default ladder when env unset', () => {
      delete process.env.REVIEW_INTERVALS;
      expect(loadReviewIntervals()).toEqual(DEFAULT_REVIEW_INTERVALS);
    });

    it('parses comma-separated integers from env', () => {
      process.env.REVIEW_INTERVALS = '2, 5, 10';
      expect(loadReviewIntervals()).toEqual([2, 5, 10]);
    });

    it('falls back to default on invalid env', () => {
      process.env.REVIEW_INTERVALS = 'abc,,0,-3';
      expect(loadReviewIntervals()).toEqual(DEFAULT_REVIEW_INTERVALS);
    });
  });

  describe('computeNextReview — correct', () => {
    const intervals = [1, 2, 4, 7, 15, 30, 60];

    it('first correct → reviewCount 1, interval[0]=1, ease +0.1', () => {
      const r = computeNextReview({ correct: true, now: FIXED_NOW, intervals });
      expect(r.reviewCount).toBe(1);
      expect(r.intervalDays).toBe(1);
      expect(r.easeFactor).toBeCloseTo(2.6, 5);
      expect(r.dueDate.getTime()).toBe(FIXED_NOW.getTime() + 1 * DAY_MS);
    });

    it('climbs the ladder with consecutive correct (reviewCount 3 → interval[2]=4)', () => {
      const r = computeNextReview({
        correct: true,
        prevReviewCount: 2,
        prevEaseFactor: 2.7,
        now: FIXED_NOW,
        intervals,
      });
      expect(r.reviewCount).toBe(3);
      expect(r.intervalDays).toBe(4);
      expect(r.easeFactor).toBeCloseTo(2.8, 5);
    });

    it('clamps ladder index at the last rung (long streak)', () => {
      const r = computeNextReview({
        correct: true,
        prevReviewCount: 50,
        now: FIXED_NOW,
        intervals,
      });
      expect(r.reviewCount).toBe(51);
      expect(r.intervalDays).toBe(60); // intervals[len-1]
    });

    it('caps easeFactor at 3.0', () => {
      const r = computeNextReview({
        correct: true,
        prevEaseFactor: 2.95,
        now: FIXED_NOW,
        intervals,
      });
      expect(r.easeFactor).toBe(EASE_FACTOR_MAX);
    });

    it('handles missing prev safely (defaults: count 0 / ease 2.5)', () => {
      const r = computeNextReview({ correct: true, now: FIXED_NOW, intervals });
      expect(r.reviewCount).toBe(1);
      expect(r.easeFactor).toBeCloseTo(2.6, 5);
    });
  });

  describe('computeNextReview — incorrect', () => {
    const intervals = [1, 2, 4, 7, 15, 30, 60];

    it('resets reviewCount to 0 and interval to ladder[0]', () => {
      const r = computeNextReview({
        correct: false,
        prevReviewCount: 5,
        prevEaseFactor: 2.8,
        now: FIXED_NOW,
        intervals,
      });
      expect(r.reviewCount).toBe(0);
      expect(r.intervalDays).toBe(1);
      expect(r.easeFactor).toBeCloseTo(2.6, 5); // 2.8 - 0.2
      expect(r.dueDate.getTime()).toBe(FIXED_NOW.getTime() + 1 * DAY_MS);
    });

    it('floors easeFactor at 1.3', () => {
      const r = computeNextReview({
        correct: false,
        prevEaseFactor: 1.35,
        now: FIXED_NOW,
        intervals,
      });
      expect(r.easeFactor).toBe(EASE_FACTOR_MIN);
    });
  });

  describe('computeNextReview — defaults', () => {
    it('uses DEFAULT_REVIEW_INTERVALS when none provided', () => {
      const r = computeNextReview({ correct: true, now: FIXED_NOW });
      expect(r.intervalDays).toBe(DEFAULT_REVIEW_INTERVALS[0]);
    });

    it('uses now when now omitted', () => {
      const before = Date.now();
      const r = computeNextReview({ correct: true });
      expect(r.dueDate.getTime()).toBeGreaterThanOrEqual(before);
    });
  });
});
