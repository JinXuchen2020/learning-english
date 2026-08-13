import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../entities/user.entity';

/**
 * 家长模块服务（AI-702 之后）。
 *
 * 历史职责（家长 PIN / 独立家长会话 JWT）已移除：
 * - 不再维护 `User.parentPinHash`；
 * - 不再签发仅由 PIN 换取的「家长会话 JWT」；
 * - 家长身份统一由 `role === 'parent'` 的登录 JWT承载，`ParentGuard` 直接校验该 JWT。
 *
 * 本服务保留为后续 AI-710「家庭绑定」等家长域功能提供落脚点。
 */
@Injectable()
export class ParentService {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    private jwtService: JwtService,
  ) {}
}
