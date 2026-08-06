/**
 * SentencesController 单元测试（AI-309）。
 * 直接实例化控制器 + fake service，验证 `GET /api/sentences` 的查询参数透传与返回，
 * 避开 JwtAuthGuard（鉴权由集成层覆盖，单测关注参数解析与 service 委托）。
 */

import { SentencesController } from './sentences.controller';
import { SentencesService, SentenceQuery } from './sentences.service';
import { Sentence } from '../entities/sentence.entity';

function makeFakeService() {
  const calls: SentenceQuery[] = [];
  const service = {
    findAll: jest.fn(async (q: SentenceQuery) => {
      calls.push(q);
      return [];
    }),
  };
  return { service: service as unknown as SentencesService, calls };
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

describe('SentencesController', () => {
  it('无查询参数 → service.findAll({})', async () => {
    const { service, calls } = makeFakeService();
    const ctrl = new SentencesController(service);
    await ctrl.findAll();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({});
  });

  it('level 参数 → 透传 level', async () => {
    const { service, calls } = makeFakeService();
    const ctrl = new SentencesController(service);
    await ctrl.findAll('L2');
    expect(calls[0]).toEqual({ level: 'L2' });
  });

  it('wordText 参数 → 透传 wordText', async () => {
    const { service, calls } = makeFakeService();
    const ctrl = new SentencesController(service);
    await ctrl.findAll(undefined, 'cat');
    expect(calls[0]).toEqual({ wordText: 'cat' });
  });

  it('空/纯空白参数 → 不写入 query（降级为不过滤）', async () => {
    const { service, calls } = makeFakeService();
    const ctrl = new SentencesController(service);
    await ctrl.findAll('  ', '   ');
    expect(calls[0]).toEqual({});
  });

  it('返回 service 结果', async () => {
    const { service } = makeFakeService();
    (service.findAll as jest.Mock).mockResolvedValueOnce([makeSentence({ id: 'a' })]);
    const ctrl = new SentencesController(service);
    const result = await ctrl.findAll();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });
});
