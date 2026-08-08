import {
  parsePictureBookOutput,
  computeWordCoverage,
  DEFAULT_BOOK_PAGES,
  DEFAULT_BOOK_TITLE,
} from './picture-book-agent';

describe('parsePictureBookOutput', () => {
  it('parses a clean JSON object', () => {
    const out = parsePictureBookOutput(
      JSON.stringify({
        title: 'T',
        coverImagePrompt: 'C',
        pages: [{ pageNumber: 1, text: 'p1', illustrationPrompt: 'i1' }],
      }),
    );
    expect(out.title).toBe('T');
    expect(out.coverImagePrompt).toBe('C');
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0].text).toBe('p1');
  });

  it('strips a ```json fence', () => {
    const raw = '```json\n' + JSON.stringify({ title: 'T', pages: [{ pageNumber: 1, text: 'a', illustrationPrompt: 'b' }] }) + '\n```';
    const out = parsePictureBookOutput(raw);
    expect(out.title).toBe('T');
  });

  it('throws on empty output', () => {
    expect(() => parsePictureBookOutput('')).toThrow();
    expect(() => parsePictureBookOutput('   ')).toThrow();
  });

  it('throws when no JSON object found', () => {
    expect(() => parsePictureBookOutput('not json at all')).toThrow();
  });

  it('throws when title missing', () => {
    expect(() =>
      parsePictureBookOutput(
        JSON.stringify({ pages: [{ pageNumber: 1, text: 'a', illustrationPrompt: 'b' }] }),
      ),
    ).toThrow();
  });

  it('throws when pages missing or empty', () => {
    expect(() => parsePictureBookOutput(JSON.stringify({ title: 'T' }))).toThrow();
    expect(() => parsePictureBookOutput(JSON.stringify({ title: 'T', pages: [] }))).toThrow();
  });

  it('throws when a page lacks text or illustrationPrompt', () => {
    expect(() =>
      parsePictureBookOutput(
        JSON.stringify({ title: 'T', pages: [{ pageNumber: 1, text: 'a' }] }),
      ),
    ).toThrow();
  });
});

describe('computeWordCoverage', () => {
  it('returns 0 when there are no words', () => {
    expect(computeWordCoverage('anything', [])).toBe(0);
  });

  it('counts case-insensitive substring hits', () => {
    const words = [{ text: 'Apple' }, { text: 'cat' }, { text: 'DOG' }];
    const ratio = computeWordCoverage('the apple and the cat played', words);
    expect(ratio).toBeCloseTo(2 / 3, 5);
  });

  it('reports full coverage when all words appear', () => {
    const words = [{ text: 'apple' }, { text: 'cat' }, { text: 'dog' }, { text: 'sun' }];
    const ratio = computeWordCoverage('apple cat dog sun are friends', words);
    expect(ratio).toBe(1);
  });

  it('meets the >=80% acceptance bar for a typical course', () => {
    const words = [
      { text: 'apple' },
      { text: 'cat' },
      { text: 'dog' },
      { text: 'sun' },
      { text: 'book' },
    ];
    // 4 of 5 words woven into the story → 0.8
    const story = '小狐狸遇见 apple 和 cat，又看到 dog 在 sun 下玩耍。';
    const ratio = computeWordCoverage(story, words);
    expect(ratio).toBeGreaterThanOrEqual(0.8);
  });
});

describe('default book template', () => {
  it('has at least 2 pages with text + illustrationPrompt', () => {
    expect(DEFAULT_BOOK_TITLE.length).toBeGreaterThan(0);
    expect(DEFAULT_BOOK_PAGES.length).toBeGreaterThanOrEqual(2);
    for (const p of DEFAULT_BOOK_PAGES) {
      expect(p.text.length).toBeGreaterThan(0);
      expect(p.illustrationPrompt.length).toBeGreaterThan(0);
    }
  });
});
