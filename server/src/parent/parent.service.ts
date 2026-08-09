import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';

/**
 * 家长模式服务（AI-702）。
 *
 * 负责：
 * - PIN 哈希存储（`User.parentPinHash`，bcrypt，非明文）；
 * - PIN 校验（verifyPin）/ 首次设置（setPin）/ 修改（changePin）；
 * - 签发**家长会话 JWT**（`role: 'parent'`，15 分钟过期），与 child JWT 分离。
 *
 * 安全口径：4 位数字 PIN 仅 10⁴ 组合，bcrypt 哈希仅满足「不落明文」基线（demo 级），
 * 未引入限流/锁定（超范围）。校验失败一律返回布尔/`false`，不泄露是否「已设 PIN」。
 */
@Injectable()
export class ParentService {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    private jwtService: JwtService,
  ) {}

  /** 是否已设置家长 PIN。 */
  async hasPin(userId: string): Promise<boolean> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    return !!user?.parentPinHash;
  }

  /**
   * 校验 PIN。无 PIN 或未匹配均返回 `false`（不抛错，便于控制器统一返回 401）。
   */
  async verifyPin(userId: string, pin: string): Promise<boolean> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user?.parentPinHash) return false;
    try {
      return await bcrypt.compare(pin, user.parentPinHash);
    } catch {
      return false;
    }
  }

  /** 哈希并写入 PIN（供首次设置 / 修改共用）。 */
  private async setPinHash(userId: string, pin: string): Promise<void> {
    const hash = await bcrypt.hash(pin, 10);
    await this.usersRepo.update({ id: userId }, { parentPinHash: hash });
  }

  /**
   * 首次设置 PIN（仅当尚未设置）。已设置则抛 `ConflictException`（409）。
   * 成功后调用方应签发家长会话令牌。
   */
  async setupPin(userId: string, pin: string): Promise<void> {
    const existing = await this.usersRepo.findOne({ where: { id: userId } });
    if (existing?.parentPinHash) {
      throw new ConflictException('家长 PIN 已设置，请使用修改 PIN');
    }
    await this.setPinHash(userId, pin);
  }

  /**
   * 修改 PIN：先校验旧 PIN，再写新哈希。旧 PIN 错误抛 `UnauthorizedException`。
   */
  async changePin(userId: string, oldPin: string, newPin: string): Promise<void> {
    const ok = await this.verifyPin(userId, oldPin);
    if (!ok) {
      throw new UnauthorizedException('旧 PIN 不正确');
    }
    await this.setPinHash(userId, newPin);
  }

  /** 签发家长会话 JWT（独立令牌，role=parent，15 分钟过期）。 */
  signParentToken(userId: string): string {
    return this.jwtService.sign(
      { sub: userId, role: 'parent' },
      { expiresIn: '15m' },
    );
  }
}
