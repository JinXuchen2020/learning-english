import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from '../entities/user.entity';

jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));

describe('AuthService', () => {
  let service: AuthService;
  let usersRepo: any;
  let jwtService: { sign: jest.Mock };

  const mockUser = (over: Partial<User> = {}): User =>
    ({
      id: 'u1',
      username: 'foo',
      password: 'hashed',
      nickname: 'foo',
      totalStars: 0,
      streakDays: 0,
      lastActiveDate: null,
      createdAt: new Date(),
      lessonProgress: [],
      wordProgress: [],
      taskCompletions: [],
      ...over,
    } as User);

  beforeEach(async () => {
    jwtService = { sign: jest.fn().mockReturnValue('tok') };
    usersRepo = {
      findOne: jest.fn(),
      create: jest.fn((e) => e as User),
      save: jest.fn(async (e) => e as User),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('register: hashes password and returns token', async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
    usersRepo.findOne.mockResolvedValue(null);
    const res = await service.register('foo', 'pw', 'Nick');
    expect(bcrypt.hash).toHaveBeenCalledWith('pw', 10);
    expect(usersRepo.create).toHaveBeenCalled();
    expect(res.accessToken).toBe('tok');
    expect(res.user.username).toBe('foo');
    expect(res.user.nickname).toBe('Nick');
  });

  it('register: defaults nickname to username', async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue('h');
    usersRepo.findOne.mockResolvedValue(null);
    const res = await service.register('foo', 'pw');
    expect(res.user.nickname).toBe('foo');
  });

  it('register: forces role=parent when no role given (AI-710)', async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue('h');
    usersRepo.findOne.mockResolvedValue(null);
    await service.register('foo', 'pw', 'Nick');
    expect(usersRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'parent' }),
    );
  });

  it('register: forces role=parent even when role=child passed (AI-710)', async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue('h');
    usersRepo.findOne.mockResolvedValue(null);
    await service.register('foo', 'pw', 'Nick', 'child');
    expect(usersRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'parent' }),
    );
  });

  it('register: forces role=parent when role=parent passed (AI-710)', async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue('h');
    usersRepo.findOne.mockResolvedValue(null);
    await service.register('foo', 'pw', 'Nick', 'parent');
    expect(usersRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'parent' }),
    );
  });

  it('register: throws Conflict when username taken', async () => {
    usersRepo.findOne.mockResolvedValue(mockUser());
    await expect(service.register('foo', 'pw')).rejects.toBeInstanceOf(ConflictException);
  });

  it('login: throws Unauthorized when user missing', async () => {
    usersRepo.findOne.mockResolvedValue(null);
    await expect(service.login('foo', 'pw')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login: throws Unauthorized when password invalid', async () => {
    usersRepo.findOne.mockResolvedValue(mockUser());
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    await expect(service.login('foo', 'pw')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login: returns token on valid credentials', async () => {
    usersRepo.findOne.mockResolvedValue(mockUser());
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const res = await service.login('foo', 'pw');
    expect(bcrypt.compare).toHaveBeenCalledWith('pw', 'hashed');
    expect(res.accessToken).toBe('tok');
  });

  it('validateUser: throws Unauthorized when missing', async () => {
    usersRepo.findOne.mockResolvedValue(null);
    await expect(service.validateUser('u1')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('validateUser: returns user when found', async () => {
    usersRepo.findOne.mockResolvedValue(mockUser({ id: 'u1' }));
    const u = await service.validateUser('u1');
    expect(u.id).toBe('u1');
  });
});
