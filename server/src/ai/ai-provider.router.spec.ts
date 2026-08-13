import { AiProviderRouter } from './ai-provider.router';
import { aiContextStorage } from './ai-provider.context';
import { AiProvider, ChatMessage, ChatResult } from './ai-provider.interface';
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

describe('AiProviderRouter (AI-705 + AI-711)', () => {
  const CHILD = 'child-1';
  const PARENT = 'parent-1';

  it('无上下文 → 回退默认 provider', async () => {
    const def = fakeProvider('mock');
    const svc = { resolveForChild: jest.fn(), resolveDefault: jest.fn(), buildProvider: jest.fn() } as any;
    const router = new AiProviderRouter(def, svc);
    const res = await aiContextStorage.run({}, () => router.chat([{ role: 'user', content: 'x' }]));
    expect(res.text).toBe('from-mock');
    expect(svc.resolveForChild).not.toHaveBeenCalled();
    expect(svc.resolveDefault).not.toHaveBeenCalled();
  });

  it('child 角色：resolveForChild 命中覆盖 → 走自定义 provider', async () => {
    const def = fakeProvider('mock');
    const custom = fakeProvider('openai');
    const cfg = { id: 'override' } as ProviderConfig;
    const svc = {
      resolveForChild: jest.fn(async () => cfg),
      resolveDefault: jest.fn(),
      buildProvider: jest.fn(() => custom),
    } as any;
    const router = new AiProviderRouter(def, svc);
    const res = await aiContextStorage.run({ userId: CHILD, role: 'child' }, () =>
      router.chat([{ role: 'user', content: 'x' }]),
    );
    expect(svc.resolveForChild).toHaveBeenCalledWith(CHILD);
    expect(svc.buildProvider).toHaveBeenCalledWith(cfg);
    expect(res.text).toBe('from-openai');
  });

  it('child 角色：resolveForChild 回退家长默认 → 走家长默认 provider', async () => {
    const def = fakeProvider('mock');
    const parentDefault = fakeProvider('bigmodel');
    const cfg = { id: 'parent-default' } as ProviderConfig;
    const svc = {
      // 覆盖配置不存在 → resolveForChild 内含家长默认回退，返回家长默认
      resolveForChild: jest.fn(async () => cfg),
      resolveDefault: jest.fn(),
      buildProvider: jest.fn(() => parentDefault),
    } as any;
    const router = new AiProviderRouter(def, svc);
    const res = await aiContextStorage.run({ userId: CHILD, role: 'child' }, () =>
      router.chat([{ role: 'user', content: 'x' }]),
    );
    expect(svc.resolveForChild).toHaveBeenCalledWith(CHILD);
    expect(svc.buildProvider).toHaveBeenCalledWith(cfg);
    expect(res.text).toBe('from-bigmodel');
  });

  it('child 角色：resolveForChild 返回 null → 回退默认', async () => {
    const def = fakeProvider('mock');
    const svc = {
      resolveForChild: jest.fn(async () => null),
      resolveDefault: jest.fn(),
      buildProvider: jest.fn(),
    } as any;
    const router = new AiProviderRouter(def, svc);
    const res = await aiContextStorage.run({ userId: CHILD, role: 'child' }, () =>
      router.chat([{ role: 'user', content: 'x' }]),
    );
    expect(res.text).toBe('from-mock');
    expect(svc.buildProvider).not.toHaveBeenCalled();
  });

  it('parent 角色：resolveDefault 命中 → 走自定义 provider', async () => {
    const def = fakeProvider('mock');
    const custom = fakeProvider('bigmodel');
    const cfg = { id: 'c1' } as ProviderConfig;
    const svc = {
      resolveDefault: jest.fn(async () => cfg),
      resolveForChild: jest.fn(),
      buildProvider: jest.fn(() => custom),
    } as any;
    const router = new AiProviderRouter(def, svc);
    const res = await aiContextStorage.run({ userId: PARENT, role: 'parent' }, () =>
      router.chat([{ role: 'user', content: 'x' }]),
    );
    expect(svc.resolveDefault).toHaveBeenCalledWith(PARENT);
    expect(svc.resolveForChild).not.toHaveBeenCalled();
    expect(res.text).toBe('from-bigmodel');
  });

  it('parent 角色：解析/构建异常 → 安全回退默认（不向外抛）', async () => {
    const def = fakeProvider('mock');
    const svc = {
      resolveDefault: jest.fn(async () => {
        throw new Error('db boom');
      }),
      resolveForChild: jest.fn(),
      buildProvider: jest.fn(),
    } as any;
    const router = new AiProviderRouter(def, svc);
    const res = await aiContextStorage.run({ userId: PARENT, role: 'parent' }, () =>
      router.chat([{ role: 'user', content: 'x' }]),
    );
    expect(res.text).toBe('from-mock');
  });

  it('所有 AiProvider 方法都委托（transcribe/synthesize/assess）', async () => {
    const def = fakeProvider('mock');
    const svc = { resolveForChild: jest.fn(), resolveDefault: jest.fn(), buildProvider: jest.fn() } as any;
    const router = new AiProviderRouter(def, svc);
    await aiContextStorage.run({}, () => router.transcribe({ data: Buffer.from('x'), mimeType: 'audio/webm' }));
    await aiContextStorage.run({}, () => router.synthesize('hi'));
    await aiContextStorage.run({}, () => router.assessPronunciation({ data: Buffer.from('x'), mimeType: 'audio/webm' }, 'cat'));
    expect(def.transcribe).toHaveBeenCalled();
    expect(def.synthesize).toHaveBeenCalled();
    expect(def.assessPronunciation).toHaveBeenCalled();
  });
});
