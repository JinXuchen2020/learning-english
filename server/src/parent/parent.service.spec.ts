import { Test } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ParentService } from './parent.service';
import { User } from '../entities/user.entity';

jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));

describe('ParentService (AI-710)', () => {
  let service: ParentService;
  let usersRepo: any;
  let jwtService: { sign: jest.Mock };

  const mockUser = (over: Partial<User> = {}): User =>
    ({
      id: 'child-1',
      username: 'kid',
      password: 'hashed',
      nickname: 'Kid',
      totalStars: 5,
      streakDays: 2,
      level: 1,
      role: 'child',
      parentId: 'parent-1',
      createdAt: new Date('2026-01-01'),
      ...over,
    } as User);

  beforeEach(async () => {
    jwtService = { sign: jest.fn().mockReturnValue('tok') };
    usersRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((e) => e as User),
      // save 模拟数据库回写：补全 DB 生成的字段（id/level/totalStars/streakDays/createdAt）
      save: jest.fn(async (e) => ({ ...mockUser(), ...e }) as User),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ParentService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();
    service = moduleRef.get(ParentService);
  });

  /* ---------- createChild ---------- */

  it('createChild: hashes password, sets role=child + parentId', async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
    usersRepo.findOne.mockResolvedValue(null);
    const res = await service.createChild('parent-1', {
      nickname: 'Alice',
      username: 'alice',
      password: 'Passw0rd!',
    });
    expect(bcrypt.hash).toHaveBeenCalledWith('Passw0rd!', 10);
    expect(usersRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'alice',
        nickname: 'Alice',
        role: 'child',
        parentId: 'parent-1',
      }),
    );
    expect(res.role).toBe('child');
    expect(res.id).toBe('child-1');
    // ChildView must not include password
    expect((res as any).password).toBeUndefined();
  });

  it('createChild: throws Conflict when username taken', async () => {
    usersRepo.findOne.mockResolvedValue(mockUser());
    await expect(
      service.createChild('parent-1', {
        nickname: 'A',
        username: 'kid',
        password: 'Passw0rd!',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  /* ---------- claimChild ---------- */

  it('claimChild: verifies password and sets parentId', async () => {
    const child = mockUser({ parentId: null });
    usersRepo.findOne.mockResolvedValue(child);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const res = await service.claimChild('parent-1', {
      username: 'kid',
      password: 'Passw0rd!',
    });
    expect(bcrypt.compare).toHaveBeenCalledWith('Passw0rd!', 'hashed');
    expect(child.parentId).toBe('parent-1');
    expect(usersRepo.save).toHaveBeenCalledWith(child);
    expect(res.username).toBe('kid');
  });

  it('claimChild: throws Unauthorized when user not found', async () => {
    usersRepo.findOne.mockResolvedValue(null);
    await expect(
      service.claimChild('parent-1', {
        username: 'ghost',
        password: 'pw',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('claimChild: throws Unauthorized when password wrong', async () => {
    usersRepo.findOne.mockResolvedValue(mockUser());
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    await expect(
      service.claimChild('parent-1', {
        username: 'kid',
        password: 'wrong',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('claimChild: throws Conflict when belongs to another parent', async () => {
    usersRepo.findOne.mockResolvedValue(mockUser({ parentId: 'other-parent' }));
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    await expect(
      service.claimChild('parent-1', {
        username: 'kid',
        password: 'pw',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('claimChild: idempotent when already belongs to same parent', async () => {
    const child = mockUser({ parentId: 'parent-1' });
    usersRepo.findOne.mockResolvedValue(child);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const res = await service.claimChild('parent-1', {
      username: 'kid',
      password: 'pw',
    });
    // Should NOT save (no change needed)
    expect(usersRepo.save).not.toHaveBeenCalled();
    expect(res.username).toBe('kid');
  });

  /* ---------- listChildren ---------- */

  it('listChildren: returns children with matching parentId', async () => {
    const kids = [
      mockUser({ id: 'c1', username: 'a' }),
      mockUser({ id: 'c2', username: 'b' }),
    ];
    usersRepo.find.mockResolvedValue(kids);
    const res = await service.listChildren('parent-1');
    expect(usersRepo.find).toHaveBeenCalledWith({
      where: { parentId: 'parent-1', role: 'child' },
      order: { createdAt: 'ASC' },
    });
    expect(res).toHaveLength(2);
    expect(res[0].username).toBe('a');
    // No password in view
    expect((res[0] as any).password).toBeUndefined();
  });

  it('listChildren: returns empty array when no children', async () => {
    usersRepo.find.mockResolvedValue([]);
    const res = await service.listChildren('parent-1');
    expect(res).toEqual([]);
  });

  /* ---------- unlinkChild ---------- */

  it('unlinkChild: clears parentId', async () => {
    const child = mockUser({ parentId: 'parent-1' });
    usersRepo.findOne.mockResolvedValue(child);
    await service.unlinkChild('parent-1', 'child-1');
    expect(child.parentId).toBeNull();
    expect(usersRepo.save).toHaveBeenCalledWith(child);
  });

  it('unlinkChild: throws NotFound when child not found', async () => {
    usersRepo.findOne.mockResolvedValue(null);
    await expect(
      service.unlinkChild('parent-1', 'nope'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('unlinkChild: throws NotFound when child belongs to another parent', async () => {
    usersRepo.findOne.mockResolvedValue(
      mockUser({ parentId: 'other-parent' }),
    );
    await expect(
      service.unlinkChild('parent-1', 'child-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  /* ---------- ChildView shape ---------- */

  it('ChildView has correct shape (no password, hasProviderOverride=false)', async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue('h');
    usersRepo.findOne.mockResolvedValue(null);
    const res = await service.createChild('p1', {
      nickname: 'N',
      username: 'u',
      password: 'pass',
    });
    expect(res).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        nickname: expect.any(String),
        username: expect.any(String),
        role: 'child',
        level: expect.any(Number),
        totalStars: expect.any(Number),
        streakDays: expect.any(Number),
        hasProviderOverride: false,
        createdAt: expect.any(Date),
      }),
    );
    expect((res as any).password).toBeUndefined();
    expect((res as any).parentId).toBeUndefined();
  });
});
