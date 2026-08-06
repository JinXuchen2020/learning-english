/**
 * SentencesService 单元测试（AI-309）。
 * fake repo 提供 `find`（返回可配置数组），验证 findAll 的 level 排序 /
 * wordText 内存过滤与 findById 命中-未命中分支。
 */

import { SentencesService } from './sentences.service';
import { Sentence } from '../entities/sentence.entity';
import { Repository } from 'typeorm';

function makeFakeRepo(rows: Sentence[]): Repository<Sentence> {
  return {
    find: jest.fn(async () => rows),
    findOne: jest.fn(),
  } as unknown as Repository<Sentence>;
}

function makeSentence(over: Partial<Sentence>): Sentence {
  return {
    id: 's1',
    text: 'The cat is small.',
    meaning: '猫很小。',
    level: 'L1',
    wordTexts: ['cat'],
    tags: ['animal'],
    lessonId: null,
    sortOrder: 1,
    ...over,
  };
}

describe('SentencesService', () => {
  it('findAll 无过滤 → 返回全部，按 level 升序 + sortOrder 升序', async () => {
    const rows = [
      makeSentence({ id: 'b', level: 'L2', sortOrder: 2, text: 'B' }),
      makeSentence({ id: 'a', level: 'L1', sortOrder: 1, text: 'A' }),
      makeSentence({ id: 'c', level: 'L1', sortOrder: 2, text: 'C' }),
    ];
    const svc = new SentencesService(makeFakeRepo(rows));
    const result = await svc.findAll();
    expect(result.map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('findAll level=L1 → 仅返回 L1', async () => {
    const rows = [
      makeSentence({ id: 'a', level: 'L1' }),
      makeSentence({ id: 'b', level: 'L2' }),
      makeSentence({ id: 'c', level: 'L1', sortOrder: 2, text: 'C' }),
    ];
    const svc = new SentencesService(makeFakeRepo(rows));
    const result = await svc.findAll({ level: 'L1' });
    expect(result.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('findAll wordText=cat → 仅返回 wordTexts 含 cat（不区分大小写）', async () => {
    const rows = [
      makeSentence({ id: 'a', wordTexts: ['Cat'] }),
      makeSentence({ id: 'b', wordTexts: ['dog'] }),
      makeSentence({ id: 'c', wordTexts: ['cat', 'dog'] }),
    ];
    const svc = new SentencesService(makeFakeRepo(rows));
    const result = await svc.findAll({ wordText: 'CAT' });
    expect(result.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('findAll 空 wordText → 等价于不过滤', async () => {
    const rows = [makeSentence({ id: 'a' }), makeSentence({ id: 'b', level: 'L2' })];
    const svc = new SentencesService(makeFakeRepo(rows));
    const result = await svc.findAll({ wordText: '   ' });
    expect(result).toHaveLength(2);
  });

  it('findById 命中 → 返回该句', async () => {
    const found = makeSentence({ id: 'x' });
    const repo = makeFakeRepo([]);
    (repo.findOne as jest.Mock).mockResolvedValueOnce(found);
    const svc = new SentencesService(repo);
    const result = await svc.findById('x');
    expect(result?.id).toBe('x');
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'x' } });
  });

  it('findById 未命中 → 返回 null', async () => {
    const repo = makeFakeRepo([]);
    (repo.findOne as jest.Mock).mockResolvedValueOnce(null);
    const svc = new SentencesService(repo);
    const result = await svc.findById('missing');
    expect(result).toBeNull();
  });
});
