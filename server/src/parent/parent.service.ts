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
import { CreateChildDto } from './dto/create-child.dto';
import { ClaimChildDto } from './dto/claim-child.dto';

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
  createdAt: Date;
}

/**
 * 家长域服务（AI-710 家庭绑定）。
 *
 * 职责：
 * - createChild：家长创建孩子账号（role:'child' + parentId=家长.id）
 * - claimChild：家长认领已有孩子（密码校验后写 parentId）
 * - listChildren：列出本人名下孩子
 * - unlinkChild：解除归属（仅清 parentId，不删账号）
 *
 * parentId 一律取 JWT 的 userId，禁止客户端传入。
 */
@Injectable()
export class ParentService {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
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

  private toChildView(user: User): ChildView {
    return {
      id: user.id,
      nickname: user.nickname,
      username: user.username,
      role: 'child',
      level: user.level,
      totalStars: user.totalStars,
      streakDays: user.streakDays,
      // AI-711 预留：childProviderConfigId 非空时为 true
      hasProviderOverride: false,
      createdAt: user.createdAt,
    };
  }
}
