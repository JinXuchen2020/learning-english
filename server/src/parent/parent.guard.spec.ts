import { ParentGuard } from './parent.guard';

/**
 * ParentGuard 单元测试（AI-702，取代 AI-701 明文 token 门禁）。
 * 校验：缺 Authorization / 非 Bearer / child token / 过期篡改 → 拒；
 * 家长 JWT（role==='parent'） → 放行且设置 req.user。
 */
describe('ParentGuard (AI-702)', () => {
  let jwtService: any;
  let guard: ParentGuard;

  function makeCtx(req: any) {
    return { switchToHttp: () => ({ getRequest: () => req }) } as any;
  }

  beforeEach(() => {
    jwtService = { verify: jest.fn() };
    guard = new ParentGuard(jwtService);
  });

  it('无 Authorization 头 → 拒绝', async () => {
    expect(await guard.canActivate(makeCtx({ headers: {} }))).toBe(false);
    expect(jwtService.verify).not.toHaveBeenCalled();
  });

  it('非 Bearer 头 → 拒绝', async () => {
    const ctx = makeCtx({ headers: { authorization: 'Basic abc' } });
    expect(await guard.canActivate(ctx)).toBe(false);
    expect(jwtService.verify).not.toHaveBeenCalled();
  });

  it('child token（无 role / role!==parent）→ 拒绝', async () => {
    jwtService.verify.mockReturnValue({ sub: 'u1' });
    const ctx = makeCtx({ headers: { authorization: 'Bearer child-token' } });
    expect(await guard.canActivate(ctx)).toBe(false);

    jwtService.verify.mockReturnValue({ sub: 'u1', role: 'child' });
    expect(await guard.canActivate(ctx)).toBe(false);
  });

  it('过期 / 篡改 token（verify 抛错）→ 拒绝', async () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('invalid');
    });
    const ctx = makeCtx({ headers: { authorization: 'Bearer bad' } });
    expect(await guard.canActivate(ctx)).toBe(false);
  });

  it('家长 JWT（role=parent）→ 放行并设置 req.user', async () => {
    jwtService.verify.mockReturnValue({ sub: 'u1', role: 'parent' });
    const req: any = { headers: { authorization: 'Bearer parent-token' } };
    expect(await guard.canActivate(makeCtx(req))).toBe(true);
    expect(req.user).toEqual({ userId: 'u1', role: 'parent' });
  });
});
