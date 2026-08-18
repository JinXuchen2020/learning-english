import { DataSource } from 'typeorm';
import { appEntities } from '../config/database.config';
import { ensureSeed } from './bootstrap-seed';
import { ProviderConfig } from '../ai/provider-config/provider-config.entity';
import { decryptSecret } from '../ai/provider-config/crypto.util';
import { Course } from '../entities/course.entity';
import { Word } from '../entities/word.entity';
import { Sentence } from '../entities/sentence.entity';
import { DailyTask } from '../entities/daily-task.entity';

/**
 * bootstrap-seed 单测（AI-713 续 / Vercel 自举种子）。
 *
 * 用 better-sqlite3 内存库（`:memory:`）隔离验证 `ensureSeed` 的两条核心契约：
 * 1) 幂等 —— 多次调用不重复播种（内容靠「仅空表播种」、provider 靠「按 name 查重」）。
 * 2) 容错 —— 缺 key 时跳过 provider 播种、但内容仍播种，且整体不抛错（不阻断启动）。
 *
 * 不依赖真实 Postgres / 外部网络，纯内存库，可在 CI 直接跑。
 */
describe('ensureSeed (bootstrap 幂等种子)', () => {
  /** 构造隔离的内存库 DataSource（复用生产 entities，synchronize 自动建表）。 */
  function makeDs(): DataSource {
    return new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: appEntities,
      synchronize: true,
      logging: false,
    });
  }

  const originalEnv = { ...process.env };

  beforeAll(() => {
    // 提供测试用 key，确保 provider 播种分支被覆盖；PROVIDER_ENC_KEY 用 64-hex 占位避免 dev key 告警噪音。
    process.env.AGNES_API_KEY = 'test-agnes-key';
    process.env.PROVIDER_ENC_KEY = 'a'.repeat(64);
  });

  afterAll(() => {
    // 仅还原本测试改动的环境变量，不破坏 jest 注入的其它环境变量。
    for (const k of ['AGNES_API_KEY', 'PROVIDER_ENC_KEY']) {
      if (originalEnv[k] === undefined) delete process.env[k];
      else process.env[k] = originalEnv[k];
    }
  });

  it('首次调用：播种 provider 配置 + 初始内容，且不抛错', async () => {
    const ds = makeDs();
    await ds.initialize();
    try {
      await expect(ensureSeed(ds)).resolves.toBeUndefined();

      // provider 配置：仅主用 Agnes 1 条
      expect(await ds.getRepository(ProviderConfig).count()).toBe(1);
      const agnes = await ds
        .getRepository(ProviderConfig)
        .findOne({ where: { name: 'Agnes AI' } });
      expect(agnes?.isDefault).toBe(true);

      // 初始内容计数与 seed.ts 一致
      expect(await ds.getRepository(Course).count()).toBe(3);
      expect(await ds.getRepository(Word).count()).toBe(10); // 5 + 5
      expect(await ds.getRepository(Sentence).count()).toBe(36); // 12 * 3
      expect(await ds.getRepository(DailyTask).count()).toBe(3);
    } finally {
      await ds.destroy();
    }
  });

  it('重复调用：幂等（不重复播种内容 / provider）', async () => {
    const ds = makeDs();
    await ds.initialize();
    try {
      await ensureSeed(ds);
      await ensureSeed(ds);
      await ensureSeed(ds);

      expect(await ds.getRepository(Course).count()).toBe(3);
      expect(await ds.getRepository(Word).count()).toBe(10);
      expect(await ds.getRepository(Sentence).count()).toBe(36);
      expect(await ds.getRepository(DailyTask).count()).toBe(3);
      // provider 仍只有 1 条（按 name 查重）
      expect(await ds.getRepository(ProviderConfig).count()).toBe(1);
    } finally {
      await ds.destroy();
    }
  });

  it('缺 key：不抛错，跳过 provider 播种但仍播种内容', async () => {
    const ds = makeDs();
    await ds.initialize();
    try {
      const prevAgnes = process.env.AGNES_API_KEY;
      delete process.env.AGNES_API_KEY;

      await expect(ensureSeed(ds)).resolves.toBeUndefined();

      // 缺 key → provider 配置 0 条（仅告警跳过），但内容照常播种
      expect(await ds.getRepository(ProviderConfig).count()).toBe(0);
      expect(await ds.getRepository(Course).count()).toBe(3);
      expect(await ds.getRepository(Word).count()).toBe(10);
      expect(await ds.getRepository(Sentence).count()).toBe(36);

      process.env.AGNES_API_KEY = prevAgnes;
    } finally {
      await ds.destroy();
    }
  });

  it('AI-713 运维陷阱回归：env key 轮换后自举种子刷新系统 provider 的 apiKeyEnc', async () => {
    const ds = makeDs();
    await ds.initialize();
    const prevAgnes = process.env.AGNES_API_KEY;
    try {
      process.env.AGNES_API_KEY = 'first-agnes-key';
      await ensureSeed(ds);
      const repo = ds.getRepository(ProviderConfig);
      const before = await repo.findOne({ where: { name: 'Agnes AI' } });
      expect(decryptSecret(before!.apiKeyEnc!)).toBe('first-agnes-key');

      // 模拟运维轮换 key：改 env 后再次自举种子
      process.env.AGNES_API_KEY = 'rotated-agnes-key';
      await ensureSeed(ds);
      const after = await repo.findOne({ where: { name: 'Agnes AI' } });
      expect(after!.apiKeyEnc).not.toBe(before!.apiKeyEnc);
      expect(decryptSecret(after!.apiKeyEnc!)).toBe('rotated-agnes-key');
      // provider 数量不变（仍按 name 查重，不重复播种）
      expect(await repo.count()).toBe(1);
    } finally {
      process.env.AGNES_API_KEY = prevAgnes;
      await ds.destroy();
    }
  });
});
