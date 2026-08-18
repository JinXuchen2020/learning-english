import { ProviderConfigService } from './provider-config.service';
import { ProviderConfig } from './provider-config.entity';
import { encryptSecret, decryptSecret } from './crypto.util';
import { BadRequestException } from '@nestjs/common';

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
    model: 'gpt-4o-mini',
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

  it('create 加密 apiKey 并回掩码视图（含 model，isDefault=false）', async () => {
    const view = await svc.create(OWNER, {
      name: 'My GPU',
      type: 'openai-compatible',
      baseUrl: 'https://api.test/v1',
      apiKey: 'sk-secret1234',
      model: 'gpt-4o-mini',
    });
    expect(view.hasKey).toBe(true);
    expect(view.masked).toBe('****1234');
    expect(view.isDefault).toBe(false);
    expect(view.model).toBe('gpt-4o-mini');
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
      model: 'gpt-4o-mini',
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
      baseUrl: null, apiKeyEnc: null, model: 'gpt-4o-mini', capabilitiesJson: null,
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
      baseUrl: null, apiKeyEnc: null, model: 'gpt-4o-mini', capabilitiesJson: null,
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
      apiKeyEnc: encryptSecret('sk-agnes'), model: 'agnes-2.5-flash',
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
        model: 'agnes-2.5-flash',
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
      baseUrl: 'https://api.test/v1', apiKeyEnc: 'enc', model: 'gpt-4o-mini', capabilitiesJson: null,
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
    baseUrl: null, apiKeyEnc: null, model: 'gpt-4o-mini', capabilitiesJson: null,
    isDefault: false, createdAt: new Date(), updatedAt: new Date(),
  });
  const parentDefaultCfg = (): ProviderConfig => ({
    id: 'cfg-default', ownerUserId: 'p1', name: 'Parent Default', type: 'openai-compatible',
    baseUrl: null, apiKeyEnc: null, model: 'gpt-4o-mini', capabilitiesJson: null,
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
      baseUrl: 'https://api.test/v1', apiKeyEnc: encryptSecret('sk-test'), model: 'gpt-4o-mini', capabilitiesJson: null,
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

  /* ---------- AI-714: validateCapabilities ---------- */

  describe('validateCapabilities (AI-714)', () => {
    const base = {
      type: 'openai-compatible' as const,
      baseUrl: 'https://api.test/v1',
      apiKey: 'sk-x',
      model: 'gpt-4o',
    };

    /** 按 URL 路由的最小 fetch 桩：默认全 200；可按能力注入 4xx。 */
    function makeFetch(opts: { ttsStatus?: number; sttStatus?: number; chatStatus?: number } = {}) {
      return jest.fn(async (url: string) => {
        const u = String(url);
        if (u.includes('/audio/speech')) {
          const s = opts.ttsStatus ?? 200;
          if (s !== 200) {
            return new Response(JSON.stringify({ error: { message: 'tts not supported' } }), {
              status: s,
              headers: { 'content-type': 'application/json' },
            });
          }
          return new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { 'content-type': 'audio/mpeg' },
          });
        }
        if (u.includes('/audio/transcriptions')) {
          const s = opts.sttStatus ?? 200;
          if (s !== 200) {
            return new Response(JSON.stringify({ error: { message: 'stt fail' } }), {
              status: s,
              headers: { 'content-type': 'application/json' },
            });
          }
          return new Response(JSON.stringify({ text: 'hello' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        const s = opts.chatStatus ?? 200;
        if (s !== 200) {
          return new Response(JSON.stringify({ error: { message: 'chat fail' } }), {
            status: s,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });
    }

    it('chat/tts/vision/stt 全 200 → 返回全 ok 且整体 ok:true', async () => {
      const fetchFn = makeFetch();
      const { ok, results } = await svc.validateCapabilities(
        { ...base, capabilities: ['chat', 'tts', 'vision', 'stt'] },
        fetchFn,
      );
      expect(ok).toBe(true);
      expect(results.chat.ok).toBe(true);
      expect(results.tts.ok).toBe(true);
      expect(results.vision.ok).toBe(true);
      expect(results.stt.ok).toBe(true);
    });

    it('tts 返回 400 → 该能力 ok:false 且整体 ok:false', async () => {
      const fetchFn = makeFetch({ ttsStatus: 400 });
      const { ok, results } = await svc.validateCapabilities(
        { ...base, capabilities: ['chat', 'tts'] },
        fetchFn,
      );
      expect(results.chat.ok).toBe(true);
      expect(results.tts.ok).toBe(false);
      expect(results.tts.reason).toMatch(/tts/i);
      expect(ok).toBe(false);
    });

    it('pronunciation 通用 OpenAI 端点不支持 → ok:false', async () => {
      const fetchFn = makeFetch();
      const { ok, results } = await svc.validateCapabilities(
        { ...base, capabilities: ['pronunciation'] },
        fetchFn,
      );
      expect(results.pronunciation.ok).toBe(false);
      expect(ok).toBe(false);
    });

    it('无 apiKey → 全部 ok:false 且未发起任何请求', async () => {
      const fetchFn = makeFetch();
      const { ok, results } = await svc.validateCapabilities(
        { ...base, apiKey: undefined, capabilities: ['chat', 'tts'] },
        fetchFn,
      );
      expect(ok).toBe(false);
      expect(results.chat.ok).toBe(false);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('空 capabilities → 直接 ok:true 不发起请求', async () => {
      const fetchFn = makeFetch();
      const { ok, results } = await svc.validateCapabilities(
        { ...base, capabilities: [] },
        fetchFn,
      );
      expect(ok).toBe(true);
      expect(Object.keys(results)).toHaveLength(0);
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  /* ---------- AI-714: create 能力硬拒绝 ---------- */

  describe('create 能力验证（AI-714）', () => {
    afterEach(() => jest.restoreAllMocks());

    function spyFetch(ttsStatus = 200) {
      return jest.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.includes('/audio/speech')) {
          if (ttsStatus !== 200) {
            return new Response(JSON.stringify({ error: { message: 'tts not supported' } }), {
              status: ttsStatus,
              headers: { 'content-type': 'application/json' },
            });
          }
          return new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { 'content-type': 'audio/mpeg' },
          });
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });
    }

    it('capabilities 全部通过 → 正常创建并回 model', async () => {
      spyFetch(200);
      const view = await svc.create(OWNER, {
        name: 'M',
        type: 'openai-compatible',
        baseUrl: 'https://api.test/v1',
        apiKey: 'sk-x',
        model: 'gpt-4o',
        capabilities: ['chat', 'tts'],
      });
      expect(view.model).toBe('gpt-4o');
    });

    it('tts 验证失败 → 抛 BadRequestException 且不落库', async () => {
      spyFetch(400);
      await expect(
        svc.create(OWNER, {
          name: 'M',
          type: 'openai-compatible',
          baseUrl: 'https://api.test/v1',
          apiKey: 'sk-x',
          model: 'gpt-4o',
          capabilities: ['chat', 'tts'],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('resolveConfigForCapability (AI-重构：每能力解析)', () => {
    it('家长配置声明该能力 → 取该配置（优先 isDefault）', async () => {
      const parentDefault = mkSys({
        id: 'pd',
        ownerUserId: 'parent-1',
        isDefault: true,
        capabilitiesJson: JSON.stringify(['chat']),
      });
      const parentOther = mkSys({
        id: 'po',
        ownerUserId: 'parent-1',
        isDefault: false,
        capabilitiesJson: JSON.stringify(['chat']),
      });
      repo.find = jest.fn(async () => [parentOther, parentDefault]);
      repo.findOne = jest.fn(async () =>
        mkSys({ id: 'sys', isDefault: true, capabilitiesJson: JSON.stringify(['chat']) }),
      );
      const got = await svc.resolveConfigForCapability('parent-1', 'chat');
      expect(got?.id).toBe('pd');
    });

    it('家长无声明该能力的配置 → 回退系统默认（isDefault）', async () => {
      const sys = mkSys({ id: 'sys', isDefault: true, capabilitiesJson: JSON.stringify(['chat']) });
      repo.find = jest.fn(async () => []); // 家长无任何配置
      repo.findOne = jest.fn(async () => sys);
      const got = await svc.resolveConfigForCapability('parent-1', 'chat');
      expect(got?.id).toBe('sys');
    });

    it('系统默认未声明该能力 → null（调用方应走 Mock）', async () => {
      const sys = mkSys({ id: 'sys', isDefault: true, capabilitiesJson: JSON.stringify(['chat']) });
      repo.find = jest.fn(async () => []);
      repo.findOne = jest.fn(async () => sys);
      const got = await svc.resolveConfigForCapability('parent-1', 'tts');
      expect(got).toBeNull();
    });

    it('无上下文(effectiveParentId=undefined) → 仅看系统默认', async () => {
      const sys = mkSys({ id: 'sys', isDefault: true, capabilitiesJson: JSON.stringify(['chat', 'vision']) });
      repo.findOne = jest.fn(async () => sys);
      const got = await svc.resolveConfigForCapability(undefined, 'vision');
      expect(got?.id).toBe('sys');
    });
  });
});
