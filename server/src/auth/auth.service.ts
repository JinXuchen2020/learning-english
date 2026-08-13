import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    private jwtService: JwtService,
  ) {}

  /**
   * 公开注册（AI-710 后仅限家长账号）。
   *
   * `role` 参数被忽略——公开注册**一律**落库 `role:'parent'`。
   * 孩子账号的唯一创建入口是 `POST /parent/children`（受 `ParentGuard` 保护）。
   * 保留 `role` 参数签名仅为向后兼容旧客户端，不影响行为。
   */
  async register(
    username: string,
    password: string,
    nickname?: string,
    _role?: 'child' | 'parent',
  ) {
    const existing = await this.usersRepo.findOne({ where: { username } });
    if (existing) {
      throw new ConflictException('Username already taken');
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = this.usersRepo.create({
      username,
      password: hashed,
      nickname: nickname || username,
      role: 'parent',
    });
    const saved = await this.usersRepo.save(user);

    return this.buildResponse(saved);
  }

  async login(username: string, password: string) {
    const user = await this.usersRepo.findOne({ where: { username } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildResponse(user);
  }

  async validateUser(userId: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  private buildResponse(user: User) {
    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        totalStars: user.totalStars,
        streakDays: user.streakDays,
        role: user.role,
      },
    };
  }
}
