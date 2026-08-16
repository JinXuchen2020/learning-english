import { ProviderConfigService } from './provider-config.service';
import { ProviderConfig } from './provider-config.entity';
import { encryptSecret, decryptSecret } from './crypto.util';

function makeRepo() {
  return {
    create: jest.fn((e: Partial<ProviderConfig>) => ({ ...e })),
    save: jest.fn(async (e: any) => ({
      ...e,
      id: e.id ?? 'gen-id',
      createdAt: e.createdAt ?? new Date(),
      updatedAt: e.updatedAt ?? new Date(),
    })),
    find: jest.fn(async (): Promise<ProviderConfig[]> => []),
    findOne: jest.fn(),
    update: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
  };
}

function makeUsersRepo() {
  return { findOne: jest.fn() };
}

const OWNER = 'owner-1';

/** 构造系统级 provider 实体（ownerUserId=NULL）。 */
function mkSys(p: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: 'sys',
    ownerUserId: null,
    name: 'sys',
    type: 'openai-compatible',
    baseUrl: null,
    apiKeyEnc: null,
    modelsJson: null,
    capabilitiesJson: null,
    isDefault: false,
    systemFallbackRank: null,
    extraJson: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...p,
  };
}

describe('ProviderConfigService (AI-705)', () => {
  const ORIGINAL = process.env.PROVIDER_ENC_KEY;
  let repo: ReturnType<typeof makeRepo>;
  let usersRepo: ReturnType<typeof makeUsersRepo>;
  let svc: ProviderConfigService;

  beforeEach(() => {
    process.env.PROVIDER_ENC_KEY = 'a'.repeat(64);
    repo = makeRepo();
    usersRepo = makeUsersRepo();
    svc = new ProviderConfigService(repo as any, usersRepo as any);
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.PROVIDER_ENC_KEY;
    else process.env.PROVIDER_ENC_KEY = ORIGINAL;
  });

  it('create 加密 apiKey 并回掩码视图（isDefault=false）', async () => {
    const view = await svc.create(OWNER, {
      name: 'My GPU',
      type: 'openai-compatible',
      baseUrl: 'https://api.test/v1',
      apiKey: 'sk-secret1234',
      models: { chat: 'gpt-4o-mini' },
      capabilities: ['chat', 'tts'],
    });
    expect(view.hasKey).toBe(true);
    expect(view.masked).toBe('****1234');
    expect(view.isDefault).toBe(false);
    expect(view.models.chat).toBe('gpt-4o-mini');
    // 落库的是密文，不是明文
    const saved = repo.save.mock.calls[0][0];
    expect(saved.apiKeyEnc).not.toContain('sk-secret1234');
    expect(decryptSecret(saved.apiKeyEnc)).toBe('sk-secret1234');
  });

  it('update 改写 apiKey 并重新加密；省略则不改动', async () => {
    const existing: ProviderConfig = {
      id: 'c1',
      ownerUserId: OWNER,
      name: 'Old',
      type: 'openai-compatible',
      baseUrl: 'https://api.test/v1',
      apiKeyEnc: 'enc-old',
      modelsJson: null,
      capabilitiesJson: null,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repo.findOne.mockResolvedValue(existing);
    const view = await svc.update('c1', OWNER, { name: 'New', apiKey: 'sk-new5678' });
    expect(view.name).toBe('New');
    expect(view.masked).toBe('****5678');
  });

  it('update 越权（owner 不匹配）抛 ForbiddenException', async () => {
    repo.findOne.mockResolvedValue({ id: 'c1', ownerUserId: 'other' });
    await expect(svc.update('c1', OWNER, { name: 'x' })).rejects.toThrow(/无权/);
  });

  it('update 不存在抛 NotFoundException', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(svc.update('c1', OWNER, { name: 'x' })).rejects.toThrow(/不存在/);
  });

  it('remove 所有权校验后删除', async () => {
    repo.findOne.mockResolvedValue({ id: 'c1', ownerUserId: OWNER });
    await svc.remove('c1', OWNER);
    expect(repo.remove).toHaveBeenCalled();
  });

  it('setDefault 同账号互斥', async () => {
    const entity: ProviderConfig = {
      id: 'c1', ownerUserId: OWNER, name: 'A', type: 'openai-compatible',
      baseUrl: null, apiKeyEnc: null, modelsJson: null, capabilitiesJson: null,
      isDefault: false, createdAt: new Date(), updatedAt: new Date(),
    };
    repo.findOne.mockResolvedValue(entity);
    const view = await svc.setDefault('c1', OWNER);
    expect(view.isDefault).toBe(true);
    expect(repo.update).toHaveBeenCalledWith({ ownerUserId: OWNER }, { isDefault: false });
  });

  it('resolveDefault 命中默认配置', async () => {
    const def: ProviderConfig = {
      id: 'c1', ownerUserId: OWNER, name: 'A', type: 'openai-compatible',
      baseUrl: null, apiKeyEnc: null, modelsJson: null, capabilitiesJson: null,
      isDefault: true, createdAt: new Date(), updatedAt: new Date(),
    };
    repo.findOne.mockResolvedValue(def);
    expect(await svc.resolveDefault(OWNER)).toBe(def);
  });

  it('resolveSystemChain: 主用(isDefault)在前，兜底按 systemFallbackRank 升序', async () => {
    const agnes: ProviderConfig = mkSys({ id: 'agnes', name: 'Agnes AI', isDefault: true, systemFallbackRank: null });
    const zhipu: ProviderConfig = mkSys({ id: 'zhipu', name: '智谱 GLM (系统默认)', isDefault: false, systemFallbackRank: 1 });
    // 故意乱序返回，驗证排序
    repo.find.mockResolvedValue([zhipu, agnes]);
    const chain = await svc.resolveSystemChain();
    expect(chain.map((c) => c.id)).toEqual(['agnes', 'zhipu']);
  });

  it('resolveSystemChain: 仅兜底（无主用）→ 兜底排前', async () => {
    const zhipu: ProviderConfig = mkSys({ id: 'zhipu', isDefault: false, systemFallbackRank: 1 });
    repo.find.mockResolvedValue([zhipu]);
    const chain = await svc.resolveSystemChain();
    expect(chain.map((c) => c.id)).toEqual(['zhipu']);
  });

  it('buildProvider: openai-compatible 透传 extraJson 为 extraBody', async () => {
    const cfg: ProviderConfig = mkSys({
      id: 'agnes', type: 'openai-compatible', baseUrl: 'https://api.agnes-ai.cn/v1',
      apiKeyEnc: encryptSecret('sk-agnes'), modelsJson: JSON.stringify({ chat: 'agnes-2.5-flash' }),
      extraJson: JSON.stringify({ chat_template_kwargs: { enable_thinking: true } }),
      isDefault: true,
    });
    // 直接构造内层 provider 验证请求体（buildProvider 会再包 Retryable，这里只验透传）。
    const { OpenAiCompatibleProvider } = await import('./openai-compatible.provider');
    const fetchFn = jest.fn(
      async (_url: string, _init: RequestInit): Promise<Response> =>
        new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
          status: 200, headers: { 'content-type': 'application/json' },
        }),
    );
    const inner = new OpenAiCompatibleProvider(
      {
        apiKey: decryptSecret(cfg.apiKeyEnc!),
        baseUrl: cfg.baseUrl ?? undefined,
        chatModel: 'agnes-2.5-flash',
        extraBody: svc['parseExtra'](cfg.extraJson),
      },
      fetchFn,
    );
    await inner.chat([{ role: 'user', content: 'hi' }]);
    const body = JSON.parse(fetchFn.mock.calls[0][1].body as string);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: true });
  });

  it('buildProvider 按 type 构建（解密 key）', async () => {
    const cfg: ProviderConfig = {
      id: 'c1', ownerUserId: OWNER, name: 'A', type: 'openai-compatible',
      baseUrl: 'https://api.test/v1', apiKeyEnc: 'enc', modelsJson: null, capabilitiesJson: null,
      isDefault: true, createdAt: new Date(), updatedAt: new Date(),
    };
    // 用真实加密写入 apiKeyEnc
    const { encryptSecret } = await import('./crypto.util');
    cfg.apiKeyEnc = encryptSecret('sk-real');
    const provider = svc.buildProvider(cfg);
    expect(provider).toBeDefined();
    expect(typeof provider.chat).toBe('function');
  });

  it('resolveEffectiveParentId: parent→自身；child→parentId；异常→undefined', async () => {
    expect(await svc.resolveEffectiveParentId('u1', 'parent')).toBe('u1');
    usersRepo.findOne.mockResolvedValue({ parentId: 'p9' });
    expect(await svc.resolveEffectiveParentId('u1', 'child')).toBe('p9');
    usersRepo.findOne.mockRejectedValue(new Error('db down'));
    expect(await svc.resolveEffectiveParentId('u1', 'child')).toBeUndefined();
    expect(await svc.resolveEffectiveParentId(undefined, 'parent')).toBeUndefined();
  });

  /* ---------- AI-711: resolveForChild ---------- */

  const childEntity = (parentId: string | null, childProviderConfigId: string | null) => ({
    id: 'child-1', parentId, childProviderConfigId, role: 'child',
  });
  const overrideCfg = (): ProviderConfig => ({
    id: 'cfg-override', ownerUserId: 'p1', name: 'Override', type: 'openai-compatible',
    baseUrl: null, apiKeyEnc: null, modelsJson: null, capabilitiesJson: null,
    isDefault: false, createdAt: new Date(), updatedAt: new Date(),
  });
  const parentDefaultCfg = (): ProviderConfig => ({
    id: 'cfg-default', ownerUserId: 'p1', name: 'Parent Default', type: 'openai-compatible',
    baseUrl: null, apiKeyEnc: null, modelsJson: null, capabilitiesJson: null,
    isDefault: true, createdAt: new Date(), updatedAt: new Date(),
  });

  it('resolveForChild: 命中归属家长的覆盖配置 → 返回覆盖', async () => {
    usersRepo.findOne.mockResolvedValue(childEntity('p1', 'cfg-override'));
    repo.findOne.mockResolvedValue(overrideCfg());
    const res = await svc.resolveForChild('child-1');
    expect(res?.id).toBe('cfg-override');
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'cfg-override', ownerUserId: 'p1' },
    });
  });

  it('resolveForChild: 覆盖配置已删/不归属 → 回退家长默认', async () => {
    usersRepo.findOne.mockResolvedValue(childEntity('p1', 'cfg-override'));
    // 第一次（覆盖查）返回 null，第二次（默认查）返回家长默认
    repo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(parentDefaultCfg());
    const res = await svc.resolveForChild('child-1');
    expect(res?.id).toBe('cfg-default');
  });

  it('resolveForChild: 无覆盖 → 直接家长默认', async () => {
    usersRepo.findOne.mockResolvedValue(childEntity('p1', null));
    repo.findOne.mockResolvedValue(parentDefaultCfg());
    const res = await svc.resolveForChild('child-1');
    expect(res?.id).toBe('cfg-default');
    // 不应查覆盖
    expect(repo.findOne).toHaveBeenCalledWith({ where: { ownerUserId: 'p1', isDefault: true } });
  });

  it('resolveForChild: 孤儿（无 parentId） → null', async () => {
    usersRepo.findOne.mockResolvedValue(childEntity(null, 'cfg-override'));
    const res = await svc.resolveForChild('child-1');
    expect(res).toBeNull();
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('resolveForChild: 孩子不存在 → null', async () => {
    usersRepo.findOne.mockResolvedValue(null);
    const res = await svc.resolveForChild('ghost');
    expect(res).toBeNull();
  });

  it('resolveForChild: 空 userId → null', async () => {
    expect(await svc.resolveForChild('')).toBeNull();
    expect(await svc.resolveForChild(undefined as any)).toBeNull();
  });

  it('testConnection 成功/失败路径', async () => {
    const cfg: ProviderConfig = {
      id: 'c1', ownerUserId: OWNER, name: 'A', type: 'openai-compatible',
      baseUrl: 'https://api.test/v1', apiKeyEnc: encryptSecret('sk-test'), modelsJson: null, capabilitiesJson: null,
      isDefault: true, createdAt: new Date(), updatedAt: new Date(),
    };
    repo.findOne.mockResolvedValue(cfg);
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }) as any);
    const ok = await svc.testConnectionById('c1', OWNER);
    expect(ok.ok).toBe(true);
    fetchSpy.mockRestore();

    const fetchSpy2 = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network'));
    const fail = await svc.testConnectionById('c1', OWNER);
    expect(fail.ok).toBe(false);
    expect(fail.message).toContain('连通失败');
    fetchSpy2.mockRestore();
  });
});
