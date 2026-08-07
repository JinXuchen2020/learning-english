import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiReport } from './ai-report.entity';
import { appEntities } from '../config/database.config';

/**
 * 行为级测试：用 in-memory better-sqlite3 + 真实 `appEntities` 验证
 * AI-501 的 `ai_reports` 表确由 `synchronize` 建立，且默认值 /
 * `weakWords` 的 `simple-array` 往返 / `(userId,date)` 唯一约束 / 多用户共存
 * 落地。覆盖纯数据模型实体「建表 + 唯一约束」这一核心验收点
 * （实体自身无逻辑分支，唯一约束幂等由 AI-502 业务层消费）。
 */
describe('AiReport (AI-501 数据模型)', () => {
  let moduleRef: TestingModule;
  let repo: Repository<AiReport>;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: appEntities,
          synchronize: true,
        }),
        TypeOrmModule.forFeature([AiReport]),
      ],
    }).compile();

    moduleRef = mod;
    repo = mod.get<Repository<AiReport>>(getRepositoryToken(AiReport));
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('synchronize 自动建表，默认值正确（createdAt 生成、weakWords 默认空、suggestionText 默认空）', async () => {
    const saved = await repo.save(
      repo.create({ userId: 'u1', date: '2026-08-07', summaryText: '今天很棒！' }),
    );
    expect(saved.id).toBeDefined();
    const reloaded = await repo.findOne({ where: { id: saved.id } });
    expect(reloaded).not.toBeNull();
    expect(reloaded!.summaryText).toBe('今天很棒！');
    expect(reloaded!.weakWords).toEqual([]); // simple-array 默认空
    expect(reloaded!.suggestionText).toBe(''); // 默认空串
    expect(reloaded!.createdAt).toBeInstanceOf(Date);
  });

  it('weakWords 空数组经 simple-array round-trip 仍为空数组', async () => {
    const saved = await repo.save(
      repo.create({ userId: 'u2', date: '2026-08-07', summaryText: 's', weakWords: [] }),
    );
    const reloaded = await repo.findOne({ where: { id: saved.id } });
    expect(reloaded!.weakWords).toEqual([]);
  });

  it('weakWords 多元素 round-trip 一致（可移植到 postgres）', async () => {
    const saved = await repo.save(
      repo.create({
        userId: 'u3',
        date: '2026-08-07',
        summaryText: 's',
        weakWords: ['apple', 'banana', 'cat'],
      }),
    );
    const reloaded = await repo.findOne({ where: { id: saved.id } });
    expect(reloaded!.weakWords).toEqual(['apple', 'banana', 'cat']);
  });

  it('(userId,date) 唯一约束：同用户同日重复 save 抛 QueryFailedError', async () => {
    await repo.save(
      repo.create({ userId: 'u4', date: '2026-08-07', summaryText: 'first' }),
    );
    await expect(
      repo.save(repo.create({ userId: 'u4', date: '2026-08-07', summaryText: 'dup' })),
    ).rejects.toThrow();
    // 仅一条留存（首次），第二条被唯一约束拒绝
    const rows = await repo.find({ where: { userId: 'u4', date: '2026-08-07' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].summaryText).toBe('first');
  });

  it('不同日期可共存（唯一约束只作用于同 (userId,date) 组合）', async () => {
    await repo.save(repo.create({ userId: 'u5', date: '2026-08-07', summaryText: 'd1' }));
    await repo.save(repo.create({ userId: 'u5', date: '2026-08-08', summaryText: 'd2' }));
    const rows = await repo.find({ where: { userId: 'u5' } });
    expect(rows).toHaveLength(2);
  });

  it('不同用户同日可共存', async () => {
    await repo.save(repo.create({ userId: 'u6', date: '2026-08-07', summaryText: 'a' }));
    await repo.save(repo.create({ userId: 'u7', date: '2026-08-07', summaryText: 'b' }));
    // 仅本用例写入的两条（u6/u7 同日），证明唯一约束不跨用户
    const rows = await repo.find({ where: { userId: 'u6', date: '2026-08-07' } });
    expect(rows).toHaveLength(1);
    const rows2 = await repo.find({ where: { userId: 'u7', date: '2026-08-07' } });
    expect(rows2).toHaveLength(1);
  });
});
