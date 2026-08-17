import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { ProviderConfig, ProviderCapability } from '../ai/provider-config/provider-config.entity';
import type { ProviderConfigView } from '../ai/provider-config/provider-config.service';
import { decryptSecret, maskSecret } from '../ai/provider-config/crypto.util';
import { CreateChildDto } from './dto/create-child.dto';
import { ClaimChildDto } from './dto/claim-child.dto';
import { SetChildProviderDto } from './dto/set-child-provider.dto';

/**
 * 孩子账号视图（AI-710）。绝不包含 password。
 */
export interface ChildView {
  id: string;
  nickname: string;
  username: string;
  role: 'child';
  level: number;
  totalStars: number;
  streakDays: number;
  hasProviderOverride: boolean;
  // AI-711：当前 provider 覆盖配置 id（null = 沿用家长默认），供前端下拉预选
  providerConfigId: string | null;
  createdAt: Date;
}

/**
 * 家长域服务（AI-710 家庭绑定 + AI-711 每孩 provider 覆盖）。
 *
 * 职责：
 * - createChild：家长创建孩子账号（role:'child' + parentId=家长.id）
 * - claimChild：家长认领已有孩子（密码校验后写 parentId）
 * - listChildren：列出本人名下孩子
 * - unlinkChild：解除归属（仅清 parentId，不删账号）
 * - setChildProvider：设置/清除孩子的 provider 覆盖（AI-711）
 * - getChildProviderOptions：列出家长名下可选 provider（供前端下拉）
 *
 * parentId 一律取 JWT 的 userId，禁止客户端传入。
 * 为避免与 `ProviderConfigModule`（已 import ParentModule）形成循环依赖，
 * 本服务直接注入 `ProviderConfig` 仓库并复用 crypto 工具做掩码，不跨模块注入 `ProviderConfigService`。
 */
@Injectable()
export class ParentService {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectRepository(ProviderConfig)
    private providerConfigRepo: Repository<ProviderConfig>,
    private jwtService: JwtService,
  ) {}

  /**
   * 家长创建孩子账号。
   * @throws ConflictException username 已存在
   */
  async createChild(parentId: string, dto: CreateChildDto): Promise<ChildView> {
    const existing = await this.usersRepo.findOne({
      where: { username: dto.username },
    });
    if (existing) {
      throw new ConflictException('Username already taken');
    }

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = this.usersRepo.create({
      username: dto.username,
      password: hashed,
      nickname: dto.nickname,
      role: 'child',
      parentId,
    });
    const saved = await this.usersRepo.save(user);
    return this.toChildView(saved);
  }

  /**
   * 家长认领已有孩子：校验孩子密码 → 写 parentId。
   * @throws UnauthorizedException 密码错误或用户不存在
   * @throws ConflictException 孩子已归属其他家长
   */
  async claimChild(parentId: string, dto: ClaimChildDto): Promise<ChildView> {
    const child = await this.usersRepo.findOne({
      where: { username: dto.username },
    });
    if (!child) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, child.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 已归属其他家长 → 冲突
    if (child.parentId && child.parentId !== parentId) {
      throw new ConflictException('Child already belongs to another parent');
    }

    // 已归属自己 → 幂等返回
    if (child.parentId === parentId) {
      return this.toChildView(child);
    }

    child.parentId = parentId;
    const saved = await this.usersRepo.save(child);
    return this.toChildView(saved);
  }

  /**
   * 列出本人名下全部孩子。
   */
  async listChildren(parentId: string): Promise<ChildView[]> {
    const children = await this.usersRepo.find({
      where: { parentId, role: 'child' },
      order: { createdAt: 'ASC' },
    });
    return children.map((c) => this.toChildView(c));
  }

  /**
   * 取「归属本家长」的孩子实体；孩子不存在或不属于该家长 → 返回 null
   * （AI-712 越权防护：不泄露他孩是否存在）。
   */
  async findOwnedChild(parentId: string, childId: string): Promise<User | null> {
    const child = await this.usersRepo.findOne({
      where: { id: childId, role: 'child' },
    });
    if (!child || child.parentId !== parentId) {
      return null;
    }
    return child;
  }

  /**
   * 解除归属：仅清 parentId，不删账号。
   * @throws NotFoundException 孩子不存在或不归属该家长
   */
  async unlinkChild(parentId: string, childId: string): Promise<void> {
    const child = await this.usersRepo.findOne({
      where: { id: childId, role: 'child' },
    });
    if (!child || child.parentId !== parentId) {
      throw new NotFoundException('Child not found');
    }

    child.parentId = null;
    await this.usersRepo.save(child);
  }

  /**
   * 设置 / 清除孩子的 provider 覆盖（AI-711）。
   * @throws NotFoundException 孩子不存在或不归属该家长
   * @throws ForbiddenException providerConfigId 不归属该家长（禁止把孩子指到他人配置）
   */
  async setChildProvider(
    parentId: string,
    childId: string,
    dto: SetChildProviderDto,
  ): Promise<ChildView> {
    const child = await this.usersRepo.findOne({
      where: { id: childId, role: 'child' },
    });
    if (!child || child.parentId !== parentId) {
      throw new NotFoundException('Child not found');
    }

    const providerConfigId = dto.providerConfigId ?? null;
    if (providerConfigId) {
      // 校验配置归属该家长（禁止把孩子指到他人配置）
      const config = await this.providerConfigRepo.findOne({
        where: { id: providerConfigId, ownerUserId: parentId },
      });
      if (!config) {
        throw new ForbiddenException('Provider config does not belong to you');
      }
      child.childProviderConfigId = providerConfigId;
    } else {
      // 清除覆盖 → 孩子回退家长默认
      child.childProviderConfigId = null;
    }

    const saved = await this.usersRepo.save(child);
    return this.toChildView(saved);
  }

  /**
   * 列出家长名下可选 provider（供前端下拉）。同时校验孩子归属。
   * @throws NotFoundException 孩子不存在或不归属该家长
   */
  async getChildProviderOptions(
    parentId: string,
    childId: string,
  ): Promise<ProviderConfigView[]> {
    const child = await this.usersRepo.findOne({
      where: { id: childId, role: 'child' },
    });
    if (!child || child.parentId !== parentId) {
      throw new NotFoundException('Child not found');
    }

    const configs = await this.providerConfigRepo.find({
      where: { ownerUserId: parentId },
    });
    return configs.map((c) => this.toProviderOptionView(c));
  }

  private toProviderOptionView(config: ProviderConfig): ProviderConfigView {
    let masked = '';
    if (config.apiKeyEnc) {
      try {
        masked = maskSecret(decryptSecret(config.apiKeyEnc));
      } catch {
        masked = '****'; // 密钥不可读（key 轮换后）
      }
    }
    return {
      id: config.id,
      ownerUserId: config.ownerUserId,
      name: config.name,
      type: config.type,
      baseUrl: config.baseUrl,
      model: config.model ?? '',
      capabilities: this.parseCapabilities(config.capabilitiesJson),
      isDefault: config.isDefault,
      hasKey: !!config.apiKeyEnc,
      masked,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  private parseCapabilities(json?: string | null): ProviderCapability[] {
    if (!json) return [];
    try {
      return JSON.parse(json) as ProviderCapability[];
    } catch {
      return [];
    }
  }

  private toChildView(user: User): ChildView {
    return {
      id: user.id,
      nickname: user.nickname,
      username: user.username,
      role: 'child',
      level: user.level,
      totalStars: user.totalStars,
      streakDays: user.streakDays,
      // AI-711：孩子有独立 provider 覆盖时为 true
      hasProviderOverride: !!user.childProviderConfigId,
      // AI-711：暴露当前覆盖配置 id（null = 沿用家长默认），供前端下拉预选
      providerConfigId: user.childProviderConfigId ?? null,
      createdAt: user.createdAt,
    };
  }
}
