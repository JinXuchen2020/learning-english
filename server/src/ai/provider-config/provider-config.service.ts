import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ProviderConfig, ProviderType, ProviderCapability } from './provider-config.entity';
import { CreateProviderConfigDto, UpdateProviderConfigDto } from './provider-config.dto';
import { encryptSecret, decryptSecret, maskSecret } from './crypto.util';
import { OpenAiCompatibleProvider, FetchFn } from './openai-compatible.provider';
import { BigModelProvider } from '../bigmodel.provider';
import { createRetryableProvider } from '../retryable-ai-provider';
import { AiProvider } from '../ai-provider.interface';
import { User } from '../../entities/user.entity';

/** 1×1 透明 PNG（base64），供 vision 能力验证用极小图。 */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

/** 前端视图（绝不返回明文 apiKey）。 */
export interface ProviderConfigView {
  id: string;
  ownerUserId: string | null;
  name: string;
  type: ProviderType;
  baseUrl: string | null;
  model: string;
  capabilities: ProviderCapability[];
  isDefault: boolean;
  hasKey: boolean;
  masked: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Provider 配置服务（AI-705）。
 *
 * 职责：CRUD（密钥加密落库、读取掩码）、默认互斥、按 owner 解析默认配置、
 * 从配置构建运行时 `AiProvider`、轻量连通性探测、以及把请求上下文解析为
 * effective parent（供 `AiProviderRouter` 选 provider）。
 */
@Injectable()
export class ProviderConfigService {
  constructor(
    @InjectRepository(ProviderConfig)
    private readonly repo: Repository<ProviderConfig>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  /** 新增：加密 apiKey，默认非默认；保存前按 model 真验证所有勾选能力（硬拒绝）。 */
  async create(ownerUserId: string, dto: CreateProviderConfigDto): Promise<ProviderConfigView> {
    if (dto.capabilities && dto.capabilities.length > 0) {
      const { ok, results } = await this.validateCapabilities({
        type: dto.type,
        baseUrl: dto.baseUrl ?? null,
        apiKey: dto.apiKey,
        model: dto.model,
        capabilities: dto.capabilities,
      });
      if (!ok) {
        const failed = Object.entries(results)
          .filter(([, r]) => !r.ok)
          .map(([cap, r]) => `${cap}(${r.reason ?? '未知原因'})`)
          .join('; ');
        throw new BadRequestException(`模型 ${dto.model} 能力不足，无法保存：${failed}`);
      }
    }
    const entity = this.repo.create({
      ownerUserId,
      name: dto.name,
      type: dto.type,
      baseUrl: dto.baseUrl ?? null,
      apiKeyEnc: dto.apiKey ? encryptSecret(dto.apiKey) : null,
      model: dto.model,
      capabilitiesJson: dto.capabilities ? JSON.stringify(dto.capabilities) : null,
      extraJson: dto.extraBody ? JSON.stringify(dto.extraBody) : null,
      isDefault: false,
    });
    const saved = await this.repo.save(entity);
    return this.toView(saved);
  }

  /** 修改：apiKey 传则重新加密，省略则保留原值。所有权校验。 */
  async update(
    id: string,
    ownerUserId: string,
    dto: UpdateProviderConfigDto,
  ): Promise<ProviderConfigView> {
    const entity = await this.requireOwned(id, ownerUserId);
    if (dto.name !== undefined) entity.name = dto.name;
    if (dto.baseUrl !== undefined) entity.baseUrl = dto.baseUrl ?? null;
    if (dto.apiKey !== undefined) entity.apiKeyEnc = dto.apiKey ? encryptSecret(dto.apiKey) : null;
    if (dto.model !== undefined) entity.model = dto.model;
    if (dto.capabilities !== undefined) entity.capabilitiesJson = JSON.stringify(dto.capabilities);
    if (dto.extraBody !== undefined) {
      entity.extraJson = dto.extraBody ? JSON.stringify(dto.extraBody) : null;
    }
    // 模型或能力有变更时，用最终状态按 model 真验证（硬拒绝）。
    const finalCaps = this.parseCapabilities(entity.capabilitiesJson);
    if (dto.model !== undefined || dto.capabilities !== undefined) {
      const { ok, results } = await this.validateCapabilities({
        type: entity.type,
        baseUrl: entity.baseUrl,
        apiKey: entity.apiKeyEnc ? decryptSecret(entity.apiKeyEnc) : undefined,
        model: entity.model,
        capabilities: finalCaps,
      });
      if (!ok) {
        const failed = Object.entries(results)
          .filter(([, r]) => !r.ok)
          .map(([cap, r]) => `${cap}(${r.reason ?? '未知原因'})`)
          .join('; ');
        throw new BadRequestException(`模型 ${entity.model} 能力不足，无法保存：${failed}`);
      }
    }
    const saved = await this.repo.save(entity);
    return this.toView(saved);
  }

  /** 删除：所有权校验；删默认则后续解析回退系统默认。 */
  async remove(id: string, ownerUserId: string): Promise<void> {
    const entity = await this.requireOwned(id, ownerUserId);
    await this.repo.remove(entity);
  }

  /** 列出当前家长账号下全部配置（掩码）。 */
  async list(ownerUserId: string): Promise<ProviderConfigView[]> {
    const all = await this.repo.find({ where: { ownerUserId } });
    return all.map((e) => this.toView(e));
  }

  /** 设为该账号默认（同账号互斥）。 */
  async setDefault(id: string, ownerUserId: string): Promise<ProviderConfigView> {
    const entity = await this.requireOwned(id, ownerUserId);
    await this.repo.update({ ownerUserId }, { isDefault: false });
    entity.isDefault = true;
    const saved = await this.repo.save(entity);
    return this.toView(saved);
  }

  /** 解析某账号的默认配置（无则 null）。 */
  async resolveDefault(ownerUserId: string): Promise<ProviderConfig | null> {
    return this.repo.findOne({ where: { ownerUserId, isDefault: true } });
  }

  /** 解析系统默认配置（ownerUserId=NULL 且 isDefault=true）。无则 null。 */
  async resolveSystemDefault(): Promise<ProviderConfig | null> {
    return this.repo.findOne({ where: { ownerUserId: IsNull(), isDefault: true } });
  }

  /**
   * 解析系统 provider 链（AI-713 续）：按「主用 → 兜底」排序的全部系统 provider。
   * - 主用：`isDefault=true`（排序最前）；
   * - 兜底：其余系统 provider，按 `systemFallbackRank` 升序（NULL 排最后）。
   * 返回空数组表示未配置任何系统 provider（上层回退空 key 兜底 provider）。
   */
  async resolveSystemChain(): Promise<ProviderConfig[]> {
    const all = await this.repo.find({ where: { ownerUserId: IsNull() } });
    return all.sort((a, b) => {
      const rank = (e: ProviderConfig): number =>
        e.isDefault ? -1 : e.systemFallbackRank ?? Number.MAX_SAFE_INTEGER;
      return rank(a) - rank(b);
    });
  }

  /**
   * 解析孩子的生效 provider 配置（AI-711）。
   *
   * 优先级：child.childProviderConfigId 覆盖 → 家长 `resolveDefault`（回退基准）。
   * 多层安全降级：
   * - 孩子无 parentId（孤儿）→ null（上层回退系统默认）；
   * - 覆盖配置不存在 / 不归属孩子的家长 → 忽略覆盖，回退家长默认；
   * - 任何异常 → null（绝不抛错，调用方回退系统默认）。
   */
  async resolveForChild(childUserId: string): Promise<ProviderConfig | null> {
    if (!childUserId) return null;
    try {
      const child = await this.usersRepo.findOne({
        where: { id: childUserId, role: 'child' },
      });
      if (!child || !child.parentId) return null;

      // 孩子有 provider 覆盖，且配置归属孩子的家长 → 直接用该配置
      if (child.childProviderConfigId) {
        const override = await this.repo.findOne({
          where: {
            id: child.childProviderConfigId,
            ownerUserId: child.parentId,
          },
        });
        if (override) return override;
        // 配置已删 / 不归属 → 忽略覆盖，落入下方家长默认回退
      }

      // 回退：家长默认配置
      return this.resolveDefault(child.parentId);
    } catch {
      return null;
    }
  }

  /** 从配置构建运行时 provider（解密 key）。解密失败抛错交由上层回退。 */
  buildProvider(config: ProviderConfig): AiProvider {
    const apiKey = config.apiKeyEnc ? decryptSecret(config.apiKeyEnc) : '';
    const capabilities = this.parseCapabilities(config.capabilitiesJson);
    let inner: AiProvider;
    switch (config.type) {
      case 'openai-compatible':
        inner = new OpenAiCompatibleProvider({
          apiKey,
          baseUrl: config.baseUrl ?? undefined,
          model: config.model,
          capabilities,
          extraBody: this.parseExtra(config.extraJson),
          name: config.name,
        });
        break;
      case 'bigmodel':
        inner = new BigModelProvider({
          apiKey,
          baseUrl: config.baseUrl ?? undefined,
          model: config.model,
          capabilities,
          name: config.name,
        });
        break;
      default:
        throw new BadRequestException(`不支持的 provider 类型: ${config.type}`);
    }
    return createRetryableProvider(inner);
  }

  /** 轻量连通性探测：用配置构建 provider 并发一个极小 chat 请求。 */
  async testConnection(config: ProviderConfig): Promise<{ ok: boolean; message: string }> {
    try {
      const provider = this.buildProvider(config);
      const res = await provider.chat([{ role: 'user', content: 'ping' }], { maxTokens: 1 });
      return { ok: true, message: `连通成功（模型返回 ${(res.text || '').slice(0, 20)}）` };
    } catch (e) {
      const err = e as Error;
      return { ok: false, message: `连通失败：${err?.message ?? 'unknown'}` };
    }
  }

  /** 按 id（所有权校验后）探测连通性，供控制器调用。 */
  async testConnectionById(id: string, ownerUserId: string): Promise<{ ok: boolean; message: string }> {
    const entity = await this.requireOwned(id, ownerUserId);
    return this.testConnection(entity);
  }

  /**
   * 能力验证（AI-714 核心）：按 `model` 真发最小请求，确认该模型确实具备每个勾选能力。
   * - chat → 极小 messages ping；
   * - vision → 1×1 png（base64）走 image_url；
   * - tts → synthesize('hi') 取音频；
   * - stt → whisper-1 transcribe 静音 wav（测端点连通+鉴权）；
   * - pronunciation → 通用 OpenAI 兼容端点不支持，直接标不支持。
   * 返回分能力结果（不落库）。任一失败 → ok=false（供 create/update 硬拒绝）。
   * `fetchFn` 仅供单测注入 mock。
   */
  async validateCapabilities(
    input: {
      type: ProviderType;
      baseUrl?: string | null;
      apiKey?: string;
      model: string;
      capabilities: ProviderCapability[];
    },
    fetchFn?: FetchFn,
  ): Promise<{ ok: boolean; results: Record<string, { ok: boolean; reason?: string }> }> {
    const results: Record<string, { ok: boolean; reason?: string }> = {};
    const caps = input.capabilities ?? [];
    if (caps.length === 0) return { ok: true, results };

    if (!input.apiKey) {
      for (const cap of caps) results[cap] = { ok: false, reason: '未提供 API Key，无法验证' };
      return { ok: false, results };
    }

    const provider = new OpenAiCompatibleProvider(
      {
        apiKey: input.apiKey,
        baseUrl: input.baseUrl ?? undefined,
        model: input.model,
        capabilities: caps,
        name: 'validation',
      },
      fetchFn,
    );

    const silentWav = this.buildSilentWavBase64();
    const tinyPng = TINY_PNG_BASE64;
    for (const cap of caps) {
      try {
        switch (cap) {
          case 'chat':
            await provider.chat([{ role: 'user', content: 'ping' }], { maxTokens: 1 });
            break;
          case 'vision':
            await provider.chatWithImage('ping', { mimeType: 'image/png', data: tinyPng }, { maxTokens: 1 });
            break;
          case 'tts':
            await provider.synthesize('hi');
            break;
          case 'stt':
            await provider.transcribe({ mimeType: 'audio/wav', data: silentWav }, { language: 'en' });
            break;
          case 'pronunciation':
            throw new Error('通用 OpenAI 兼容端点不支持发音评测能力，需专有 provider');
        }
        results[cap] = { ok: true };
      } catch (e) {
        const err = e as Error;
        results[cap] = { ok: false, reason: err?.message ?? 'unknown' };
      }
    }
    const ok = Object.values(results).every((r) => r.ok);
    return { ok, results };
  }

  /** 构造 0.1s 静音 WAV（16bit PCM / 8kHz / 单声道）base64，供 STT 验证。 */
  private buildSilentWavBase64(): string {
    const sampleRate = 8000;
    const numSamples = 800;
    const dataSize = numSamples * 2;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    return buffer.toString('base64');
  }

  /**
   * 把请求上下文解析为 effective parent：
   * - parent 角色 → 自身 userId；
   * - child / 无角色 → 查 `User.parentId`（null 则 undefined）；
   * - 任何异常 → undefined（调用方回退系统默认）。
   */
  async resolveEffectiveParentId(userId: string | undefined, role?: string): Promise<string | undefined> {
    if (!userId) return undefined;
    try {
      if (role === 'parent') return userId;
      const user = await this.usersRepo.findOne({ where: { id: userId } });
      return user?.parentId ?? undefined;
    } catch {
      return undefined;
    }
  }

  // —— 内部工具 ——

  /** 所有权校验：非本人配置抛 403，不存在抛 404。 */
  private async requireOwned(id: string, ownerUserId: string): Promise<ProviderConfig> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('provider 配置不存在');
    if (entity.ownerUserId !== ownerUserId) throw new ForbiddenException('无权操作该 provider 配置');
    return entity;
  }

  /** 解析透传额外请求体（chat_template_kwargs 等）。非法 JSON → 空对象。 */
  private parseExtra(json?: string | null): Record<string, unknown> {
    if (!json) return {};
    try {
      const parsed = JSON.parse(json);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  /** 解析 capabilitiesJson（null/非法 → 空数组）；模块装配 TTS 链时用它过滤。 */
  parseCapabilities(json?: string | null): ProviderCapability[] {
    if (!json) return [];
    try {
      return JSON.parse(json) as ProviderCapability[];
    } catch {
      return [];
    }
  }

  /** 实体 → 前端视图；解密 key 仅用于生成掩码，绝不外泄明文。 */
  private toView(e: ProviderConfig): ProviderConfigView {
    let masked = '';
    if (e.apiKeyEnc) {
      try {
        masked = maskSecret(decryptSecret(e.apiKeyEnc));
      } catch {
        masked = '****'; // 密钥不可读（key 轮换后）
      }
    }
    return {
      id: e.id,
      ownerUserId: e.ownerUserId,
      name: e.name,
      type: e.type,
      baseUrl: e.baseUrl,
      model: e.model,
      capabilities: this.parseCapabilities(e.capabilitiesJson),
      isDefault: e.isDefault,
      hasKey: !!e.apiKeyEnc,
      masked,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
}
