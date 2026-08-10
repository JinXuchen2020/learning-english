import { AiProviderRouter } from './ai-provider.router';
import { aiContextStorage } from './ai-provider.context';
import { AiProvider, ChatMessage, ChatResult } from './ai-provider.interface';
import { ProviderConfigService } from './provider-config/provider-config.service';
import { ProviderConfig } from './provider-config/provider-config.entity';

function fakeProvider(name: string): AiProvider {
  return {
    name: name as any,
    chat: jest.fn(async (): Promise<ChatResult> => ({ text: `from-${name}` })),
    chatWithImage: jest.fn(),
    transcribe: jest.fn(),
    assessPronunciation: jest.fn(),
    synthesize: jest.fn(),
  };
}

const OWNER = 'owner-1';

describe('AiProviderRouter (AI-705)', () => {
  it('无上下文 → 回退默认 provider', async () => {
    const def = fakeProvider('mock');
    const svc = { resolveDefault: jest.fn(), buildProvider: jest.fn() } as any;
    const router = new AiProviderRouter(def, svc);
    const res = await aiContextStorage.run({}, () => router.chat([{ role: 'user', content: 'x' }]));
    expect(res.text).toBe('from-mock');
    expect(svc.resolveDefault).not.toHaveBeenCalled();
  });

  it('有 userId 但无默认配置 → 回退默认', async () => {
    const def = fakeProvider('mock');
    const svc = {
      resolveEffectiveParentId: jest.fn(async () => OWNER),
      resolveDefault: jest.fn(async () => null),
      buildProvider: jest.fn(),
    } as any;
    const router = new AiProviderRouter(def, svc);
    const res = await aiContextStorage.run({ userId: 'u1', role: 'child' }, () =>
      router.chat([{ role: 'user', content: 'x' }]),
    );
    expect(res.text).toBe('from-mock');
    expect(svc.resolveDefault).toHaveBeenCalledWith(OWNER);
  });

  it('有默认配置 → 走自定义 provider', async () => {
    const def = fakeProvider('mock');
    const custom = fakeProvider('bigmodel');
    const cfg = { id: 'c1' } as ProviderConfig;
    const svc = {
      resolveEffectiveParentId: jest.fn(async () => OWNER),
      resolveDefault: jest.fn(async () => cfg),
      buildProvider: jest.fn(() => custom),
    } as any;
    const router = new AiProviderRouter(def, svc);
    const res = await aiContextStorage.run({ userId: 'u1', role: 'child' }, () =>
      router.chat([{ role: 'user', content: 'x' }]),
    );
    expect(res.text).toBe('from-bigmodel');
    expect(svc.buildProvider).toHaveBeenCalledWith(cfg);
  });

  it('解析/构建异常 → 安全回退默认（不向外抛）', async () => {
    const def = fakeProvider('mock');
    const svc = {
      resolveEffectiveParentId: jest.fn(async () => OWNER),
      resolveDefault: jest.fn(async () => {
        throw new Error('db boom');
      }),
      buildProvider: jest.fn(),
    } as any;
    const router = new AiProviderRouter(def, svc);
    const res = await aiContextStorage.run({ userId: 'u1', role: 'parent' }, () =>
      router.chat([{ role: 'user', content: 'x' }]),
    );
    expect(res.text).toBe('from-mock');
  });

  it('所有 AiProvider 方法都委托（transcribe/synthesize/assess）', async () => {
    const def = fakeProvider('mock');
    const svc = { resolveDefault: jest.fn(), buildProvider: jest.fn() } as any;
    const router = new AiProviderRouter(def, svc);
    await aiContextStorage.run({}, () => router.transcribe({ data: Buffer.from('x'), mimeType: 'audio/webm' }));
    await aiContextStorage.run({}, () => router.synthesize('hi'));
    await aiContextStorage.run({}, () => router.assessPronunciation({ data: Buffer.from('x'), mimeType: 'audio/webm' }, 'cat'));
    expect(def.transcribe).toHaveBeenCalled();
    expect(def.synthesize).toHaveBeenCalled();
    expect(def.assessPronunciation).toHaveBeenCalled();
  });
});
