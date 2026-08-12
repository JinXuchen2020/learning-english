import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// 避免 jest 并行加载 bcrypt 原生模块触发 Windows 文件锁；auth.service 经此传递依赖 bcrypt
jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { register: jest.Mock; login: jest.Mock };

  beforeEach(async () => {
    authService = {
      register: jest.fn().mockResolvedValue({ ok: true }),
      login: jest.fn().mockResolvedValue({ ok: true }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    controller = moduleRef.get(AuthController);
  });

  it('register forwards dto to service', async () => {
    const dto = { username: 'a', password: 'b', nickname: 'c' };
    await controller.register(dto as any);
    // RegisterDto 含可选 role 字段，controller 会透传（缺省为 undefined），
    // 故实际调用为 4 个参数；service.register 的 role 参数本就可选，undefined 等价不传。
    expect(authService.register).toHaveBeenCalledWith('a', 'b', 'c', undefined);
  });

  it('login forwards dto to service', async () => {
    const dto = { username: 'a', password: 'b' };
    await controller.login(dto as any);
    expect(authService.login).toHaveBeenCalledWith('a', 'b');
  });
});
