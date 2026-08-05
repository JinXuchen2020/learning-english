import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiSpeechAttempt } from './ai-speech-attempt.entity';
import { AiSpeechAttemptService } from './ai-speech-attempt.service';
import { appEntities } from '../config/database.config';

/**
 * 行为级测试：用 in-memory better-sqlite3 + 真实 `appEntities` 验证
 * AI-301 的 `ai_speech_attempts` 表确由 `synchronize` 建立，且默认值 /
 * `simple-array` 往返 / 服务层 `clampScore` 兜底 / 倒序查询落地。
 * 覆盖纯数据模型实体「建表」这一核心验收点（实体自身无逻辑分支）。
 */
describe('AiSpeechAttempt (AI-301 数据模型)', () => {
  let moduleRef: TestingModule;
  let repo: Repository<AiSpeechAttempt>;
  let service: AiSpeechAttemptService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: appEntities,
          synchronize: true,
        }),
        TypeOrmModule.forFeature([AiSpeechAttempt]),
      ],
      providers: [AiSpeechAttemptService],
    }).compile();

    moduleRef = mod;
    repo = mod.get<Repository<AiSpeechAttempt>>(getRepositoryToken(AiSpeechAttempt));
    service = mod.get(AiSpeechAttemptService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('synchronize 自动建表，默认值正确（createdAt 生成、wordId/sentenceId 空）', async () => {
    const saved = await repo.save(
      repo.create({ userId: 'u1', audioPath: '/a.webm', score: 70, weakPhonemes: ['θ'] }),
    );
    expect(saved.id).toBeDefined();
    const reloaded = await repo.findOne({ where: { id: saved.id } });
    expect(reloaded).not.toBeNull();
    expect(reloaded!.score).toBe(70);
    expect(reloaded!.weakPhonemes).toEqual(['θ']);
    expect(reloaded!.createdAt).toBeInstanceOf(Date);
    expect(reloaded!.wordId).toBeNull();
    expect(reloaded!.sentenceId).toBeNull();
  });

  it('weakPhonemes 空数组经 simple-array round-trip 仍为空数组', async () => {
    const saved = await repo.save(
      repo.create({ userId: 'u2', audioPath: '/b.webm', score: 0, weakPhonemes: [] }),
    );
    const reloaded = await repo.findOne({ where: { id: saved.id } });
    expect(reloaded!.weakPhonemes).toEqual([]);
  });

  it('simple-array 多元素 round-trip 一致（可移植到 postgres）', async () => {
    const saved = await repo.save(
      repo.create({ userId: 'u3', audioPath: '/c.webm', score: 50, weakPhonemes: ['θ', 'ʃ', 's'] }),
    );
    const reloaded = await repo.findOne({ where: { id: saved.id } });
    expect(reloaded!.weakPhonemes).toEqual(['θ', 'ʃ', 's']);
  });

  it('service.record 落库成功，且越界 score 经 clampScore 兜底钳制', async () => {
    const ok = await service.record({
      userId: 'u4',
      audioPath: '/d.webm',
      score: 250,
      weakPhonemes: ['x'],
    });
    expect(ok).toBe(true);
    const rows = await repo.find({ where: { userId: 'u4' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(100); // 250 → 100
  });

  it('service.findByUser 按 createdAt 倒序返回', async () => {
    await service.record({ userId: 'u5', audioPath: '/e1.webm', score: 10 });
    await service.record({ userId: 'u5', audioPath: '/e2.webm', score: 20 });
    const rows = await service.findByUser('u5');
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].createdAt.getTime()).toBeGreaterThanOrEqual(rows[1].createdAt.getTime());
  });
});
