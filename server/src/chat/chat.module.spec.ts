import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiChatSession } from './ai-chat-session.entity';
import { AiChatMessage, CHAT_MESSAGE_ROLES } from './ai-chat-message.entity';
import { ChatModule } from './chat.module';
import { appEntities } from '../config/database.config';

/**
 * 行为级测试：用 in-memory better-sqlite3 + 真实 `appEntities` 验证
 * AI-401 的 `ai_chat_sessions` / `ai_chat_messages` 两表确由 `synchronize`
 * 建立，且默认值 / 字段落地 / 角色枚举完整性正确。覆盖纯数据模型实体
 * 「建表」这一核心验收点（实体自身无逻辑分支）。
 */
describe('ChatModule (AI-401 数据模型)', () => {
  let moduleRef: TestingModule;
  let sessionRepo: Repository<AiChatSession>;
  let messageRepo: Repository<AiChatMessage>;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: appEntities,
          synchronize: true,
        }),
        ChatModule,
      ],
    }).compile();

    moduleRef = mod;
    sessionRepo = mod.get<Repository<AiChatSession>>(getRepositoryToken(AiChatSession));
    messageRepo = mod.get<Repository<AiChatMessage>>(getRepositoryToken(AiChatMessage));
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('synchronize 自动建表，session 默认值正确（stars=0、sceneId 可空、时间列生成）', async () => {
    const saved = await sessionRepo.save(sessionRepo.create({ userId: 'u1' }));
    expect(saved.id).toBeDefined();
    const reloaded = await sessionRepo.findOne({ where: { id: saved.id } });
    expect(reloaded).not.toBeNull();
    expect(reloaded!.stars).toBe(0); // 默认 0
    expect(reloaded!.sceneId).toBeNull(); // 自由对话可空
    expect(reloaded!.createdAt).toBeInstanceOf(Date);
    expect(reloaded!.updatedAt).toBeInstanceOf(Date);
  });

  it('session 带 sceneId 可正常落地', async () => {
    const saved = await sessionRepo.save(sessionRepo.create({ userId: 'u2', sceneId: 'zoo' }));
    const reloaded = await sessionRepo.findOne({ where: { id: saved.id } });
    expect(reloaded!.sceneId).toBe('zoo');
  });

  it('message 字段正确落地（role/text 落库、audioPath 默认 null、按 createdAt 排序）', async () => {
    const session = await sessionRepo.save(sessionRepo.create({ userId: 'u3', sceneId: 'greeting' }));
    const saved = await messageRepo.save(
      messageRepo.create({ sessionId: session.id, role: 'user', text: 'hello fox' }),
    );
    expect(saved.id).toBeDefined();
    const reloaded = await messageRepo.findOne({ where: { id: saved.id } });
    expect(reloaded!.role).toBe('user');
    expect(reloaded!.text).toBe('hello fox');
    expect(reloaded!.audioPath).toBeNull(); // 非语音消息默认 null
    expect(reloaded!.createdAt).toBeInstanceOf(Date);
  });

  it('assistant 消息可带 audioPath', async () => {
    const session = await sessionRepo.save(sessionRepo.create({ userId: 'u4' }));
    const saved = await messageRepo.save(
      messageRepo.create({
        sessionId: session.id,
        role: 'assistant',
        text: 'hi there!',
        audioPath: '/tts/abc.mp3',
      }),
    );
    const reloaded = await messageRepo.findOne({ where: { id: saved.id } });
    expect(reloaded!.role).toBe('assistant');
    expect(reloaded!.audioPath).toBe('/tts/abc.mp3');
  });

  it('CHAT_MESSAGE_ROLES 枚举完整性（user/assistant/system）', () => {
    expect([...CHAT_MESSAGE_ROLES].sort()).toEqual(['assistant', 'system', 'user']);
  });

  it('按 sessionId 可检索该会话全部消息', async () => {
    const session = await sessionRepo.save(sessionRepo.create({ userId: 'u5' }));
    await messageRepo.save(messageRepo.create({ sessionId: session.id, role: 'user', text: 'a' }));
    await messageRepo.save(messageRepo.create({ sessionId: session.id, role: 'assistant', text: 'b' }));
    const rows = await messageRepo.find({ where: { sessionId: session.id } });
    expect(rows).toHaveLength(2);
  });
});
