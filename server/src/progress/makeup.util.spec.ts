import {
  isYesterday,
  filterWeakWords,
  mapMissedTasks,
  toUtcDate,
  MAKEUP_MASTERY_THRESHOLD,
} from './makeup.util';

// 固定「今天」为 UTC 2026-08-09，使 isYesterday 边界可断言（不依赖真实时钟）。
const TODAY = new Date('2026-08-09T00:00:00.000Z');
const YESTERDAY_ISO = '2026-08-08T12:00:00.000Z'; // 昨日中午 UTC，稳落昨日窗口
const TODAY_ISO = '2026-08-09T12:00:00.000Z'; // 今日，应被排除
const TOMORROW_ISO = '2026-08-10T12:00:00.000Z'; // 未来，应被排除

describe('makeup.util — isYesterday (AI-704)', () => {
  it('昨天(UTC)返回 true', () => {
    expect(isYesterday(YESTERDAY_ISO, TODAY)).toBe(true);
  });

  it('今天返回 false', () => {
    expect(isYesterday(TODAY_ISO, TODAY)).toBe(false);
  });

  it('未来返回 false', () => {
    expect(isYesterday(TOMORROW_ISO, TODAY)).toBe(false);
  });

  it('跨月边界：8/1 的昨天是 7/31 → true', () => {
    const aug1 = new Date('2026-08-01T00:00:00.000Z');
    expect(isYesterday('2026-07-31T23:00:00.000Z', aug1)).toBe(true);
  });

  it('跨年边界：1/1 的昨天是 12/31 → true', () => {
    const jan1 = new Date('2026-01-01T00:00:00.000Z');
    expect(isYesterday('2025-12-31T08:00:00.000Z', jan1)).toBe(true);
  });

  it('空值 / 非法值返回 false', () => {
    expect(isYesterday(null, TODAY)).toBe(false);
    expect(isYesterday(undefined, TODAY)).toBe(false);
    expect(isYesterday('not-a-date', TODAY)).toBe(false);
  });
});

describe('makeup.util — filterWeakWords (AI-704)', () => {
  const baseRow = (over: Partial<{ mastery: number; lastPracticedAt: string; wordId: string }>) => ({
    wordId: over.wordId ?? 'w1',
    wordText: 'Cat',
    meaning: '猫',
    mastery: over.mastery ?? 50,
    lastPracticedAt: over.lastPracticedAt ?? YESTERDAY_ISO,
  });

  it('纳入：昨日 + mastery<阈值', () => {
    const out = filterWeakWords([baseRow({})], new Set(), { today: TODAY });
    expect(out).toHaveLength(1);
    expect(out[0].wordId).toBe('w1');
  });

  it('排除：mastery>=阈值', () => {
    const out = filterWeakWords([baseRow({ mastery: MAKEUP_MASTERY_THRESHOLD })], new Set(), {
      today: TODAY,
    });
    expect(out).toHaveLength(0);
  });

  it('排除：非昨日(lastPracticedAt=今天)', () => {
    const out = filterWeakWords([baseRow({ lastPracticedAt: TODAY_ISO })], new Set(), {
      today: TODAY,
    });
    expect(out).toHaveLength(0);
  });

  it('排除：已在 AI-605 到期复习(dueWordIds)', () => {
    const out = filterWeakWords([baseRow({ wordId: 'w-dupe' })], new Set(['w-dupe']), {
      today: TODAY,
    });
    expect(out).toHaveLength(0);
  });

  it('按 mastery 升序排序', () => {
    const rows = [
      baseRow({ wordId: 'a', mastery: 40 }),
      baseRow({ wordId: 'b', mastery: 10 }),
      baseRow({ wordId: 'c', mastery: 55 }),
    ];
    const out = filterWeakWords(rows, new Set(), { today: TODAY });
    expect(out.map((r) => r.wordId)).toEqual(['b', 'a', 'c']);
  });

  it('缺失 meaning 兜底为空串', () => {
    const out = filterWeakWords(
      [{ wordId: 'x', wordText: 'Dog', mastery: 30, lastPracticedAt: YESTERDAY_ISO }],
      new Set(),
      { today: TODAY },
    );
    expect(out[0].meaning).toBe('');
  });
});

describe('makeup.util — mapMissedTasks (AI-704)', () => {
  it('映射 id/title/date', () => {
    const out = mapMissedTasks([
      { id: 'd1', title: '听力练习', date: '2026-08-08' },
      { id: 'd2', title: '口语练习', date: '2026-08-08' },
    ]);
    expect(out).toEqual([
      { planDayId: 'd1', title: '听力练习', date: '2026-08-08' },
      { planDayId: 'd2', title: '口语练习', date: '2026-08-08' },
    ]);
  });

  it('date 为空时兜底空串', () => {
    const out = mapMissedTasks([{ id: 'd3', title: 'x', date: null }]);
    expect(out[0].date).toBe('');
  });
});

describe('makeup.util — toUtcDate (AI-704)', () => {
  it('返回 UTC YYYY-MM-DD', () => {
    expect(toUtcDate(new Date('2026-08-09T23:59:59.000Z'))).toBe('2026-08-09');
  });
});
