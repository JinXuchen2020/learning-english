import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ParentService } from './parent.service';
import { User } from '../entities/user.entity';

/**
 * ParentService 单元测试（AI-702）。
 * 覆盖：hasPin / verifyPin（命中·未命中·无 PIN） / setupPin（写入哈希·已设置冲突）
 * / changePin（旧 PIN 错误抛错·正确更新） / signParentToken（role==='parent'）。
 * bcrypt 用真实实现（hash 异步，单测量级可接受）；User 仓库用内存假对象。
 */
describe('ParentService (AI-702)', () => {
  let usersRepo: any;
  let jwtService: JwtService;
  let service: ParentService;
  let pinHash: string;

  beforeAll(async () => {
    pinHash = await bcrypt.hash('1234', 10);
  });

  beforeEach(() => {
    usersRepo = {
      findOne: jest.fn(),
      update: jest.fn(async () => undefined),
    };
    jwtService = new JwtService({ secret: 'test-secret' });
    service = new ParentService(usersRepo, jwtService);
  });

  describe('hasPin', () => {
    it('无 PIN 返回 false', async () => {
      usersRepo.findOne.mockResolvedValue({ id: 'u1', parentPinHash: null } as User);
      expect(await service.hasPin('u1')).toBe(false);
    });
    it('有 PIN 返回 true', async () => {
      usersRepo.findOne.mockResolvedValue({ id: 'u1', parentPinHash: pinHash } as User);
      expect(await service.hasPin('u1')).toBe(true);
    });
  });

  describe('verifyPin', () => {
    it('无 PIN 返回 false（不抛错）', async () => {
      usersRepo.findOne.mockResolvedValue({ id: 'u1', parentPinHash: null } as User);
      expect(await service.verifyPin('u1', '1234')).toBe(false);
    });
    it('正确 PIN 返回 true', async () => {
      usersRepo.findOne.mockResolvedValue({ id: 'u1', parentPinHash: pinHash } as User);
      expect(await service.verifyPin('u1', '1234')).toBe(true);
    });
    it('错误 PIN 返回 false', async () => {
      usersRepo.findOne.mockResolvedValue({ id: 'u1', parentPinHash: pinHash } as User);
      expect(await service.verifyPin('u1', '0000')).toBe(false);
    });
  });

  describe('setupPin', () => {
    it('首次设置写入哈希（非明文）', async () => {
      usersRepo.findOne.mockResolvedValue({ id: 'u1', parentPinHash: null } as User);
      await service.setupPin('u1', '5678');
      expect(usersRepo.update).toHaveBeenCalledTimes(1);
      const [, patch] = usersRepo.update.mock.calls[0];
      expect(patch.parentPinHash).not.toBe('5678');
      expect(await bcrypt.compare('5678', patch.parentPinHash)).toBe(true);
    });
    it('已设置 PIN 抛 ConflictException', async () => {
      usersRepo.findOne.mockResolvedValue({ id: 'u1', parentPinHash: pinHash } as User);
      await expect(service.setupPin('u1', '5678')).rejects.toBeInstanceOf(ConflictException);
      expect(usersRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('changePin', () => {
    it('旧 PIN 错误抛 UnauthorizedException', async () => {
      usersRepo.findOne.mockResolvedValue({ id: 'u1', parentPinHash: pinHash } as User);
      await expect(service.changePin('u1', '0000', '5678')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(usersRepo.update).not.toHaveBeenCalled();
    });
    it('旧 PIN 正确则更新哈希', async () => {
      usersRepo.findOne.mockResolvedValue({ id: 'u1', parentPinHash: pinHash } as User);
      await service.changePin('u1', '1234', '5678');
      const [, patch] = usersRepo.update.mock.calls[0];
      expect(await bcrypt.compare('5678', patch.parentPinHash)).toBe(true);
    });
  });

  describe('signParentToken', () => {
    it('签发的令牌可验证且 role==="parent"', () => {
      const token = service.signParentToken('u1');
      const payload = jwtService.verify<{ sub: string; role?: string }>(token);
      expect(payload.sub).toBe('u1');
      expect(payload.role).toBe('parent');
    });
  });
});
