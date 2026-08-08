import { ScanService } from './scan.service';
import { ScannedWord } from '../entities/scanned-word.entity';

/** 极简内存 repo mock。 */
function makeRepo() {
  const store: ScannedWord[] = [];
  return {
    store,
    save: jest.fn(async (input: ScannedWord | ScannedWord[]) => {
      const arr = Array.isArray(input) ? input : [input];
      return arr.map((e, i) => {
        const row: ScannedWord = Object.assign(new ScannedWord(), e);
        if (!row.id) row.id = `gen-id-${store.length + i}`;
        if (!row.createdAt) row.createdAt = new Date();
        store.push(row);
        return row;
      });
    }),
    find: jest.fn(async (opts?: { where?: Record<string, unknown> }) => {
      let rows = store;
      if (opts?.where) {
        const w = opts.where as Record<string, unknown>;
        if (w.status) rows = rows.filter((r) => r.status === w.status);
        if (w.userId) rows = rows.filter((r) => r.userId === w.userId);
        if (w.id) {
          const idVal = (w.id as any).value ?? w.id; // In(ids) → FindOperator.value 为数组
          rows = Array.isArray(idVal)
            ? rows.filter((r) => idVal.includes(r.id))
            : rows.filter((r) => r.id === idVal);
        }
      }
      return rows;
    }),
  };
}

describe('ScanService', () => {
  let repo: ReturnType<typeof makeRepo>;
  let ai: { chatWithImage: jest.Mock };
  let service: ScanService;

  beforeEach(() => {
    repo = makeRepo();
    ai = { chatWithImage: jest.fn() };
    service = new ScanService(ai as any, repo as any);
  });

  it('recognize 成功 → 落库 pending 并返回卡片视图', async () => {
    ai.chatWithImage.mockResolvedValue({
      text: JSON.stringify([
        { word: 'apple', meaning: '苹果', example: 'I eat an apple.', imagePrompt: 'a red apple' },
        { word: 'cat', meaning: '猫' },
      ]),
      model: 'mock-vision',
    });

    const res = await service.recognize('BASE64', 'image/png', 'u1');
    expect(res.recognized).toBe(true);
    expect(res.cards).toHaveLength(2);
    expect(res.cards.every((c) => c.status === 'pending')).toBe(true);
    expect(res.model).toBe('mock-vision');
    // 落库了 2 条
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('recognize 解析为空 → recognized:false + 友好文案，不抛', async () => {
    ai.chatWithImage.mockResolvedValue({ text: '没认出来', model: 'mock' });
    const res = await service.recognize('BASE64', 'image/png', 'u1');
    expect(res.recognized).toBe(false);
    expect(res.cards).toEqual([]);
    expect(res.message).toContain('更清晰');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('confirm 仅更新当前用户的 pending 卡，跨用户 id 忽略', async () => {
    const ownedPending = Object.assign(new ScannedWord(), {
      id: 'a',
      userId: 'u1',
      wordText: 'apple',
      meaning: '苹果',
      status: 'pending' as const,
    });
    const otherPending = Object.assign(new ScannedWord(), {
      id: 'b',
      userId: 'other',
      wordText: 'cat',
      meaning: '猫',
      status: 'pending' as const,
    });
    repo.store.push(ownedPending, otherPending);

    const updated = await service.confirm(['a', 'b'], 'u1');
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe('a');
    expect(updated[0].status).toBe('saved');
    expect(ownedPending.status).toBe('saved');
    expect(otherPending.status).toBe('pending'); // 未被动
  });

  it('confirm 空 ids → 返回空', async () => {
    expect(await service.confirm([], 'u1')).toEqual([]);
  });

  it('listSaved 仅返回当前用户 saved 卡', async () => {
    repo.store.push(
      Object.assign(new ScannedWord(), { id: 'a', userId: 'u1', wordText: 'apple', meaning: '苹果', status: 'saved' as const }),
      Object.assign(new ScannedWord(), { id: 'b', userId: 'u1', wordText: 'cat', meaning: '猫', status: 'pending' as const }),
      Object.assign(new ScannedWord(), { id: 'c', userId: 'u2', wordText: 'dog', meaning: '狗', status: 'saved' as const }),
    );
    const list = await service.listSaved('u1');
    expect(list.map((c) => c.id).sort()).toEqual(['a']);
  });
});
