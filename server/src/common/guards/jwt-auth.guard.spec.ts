import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthGuard } from '@nestjs/passport';
import { ExecutionContext } from '@nestjs/common';

describe('JwtAuthGuard', () => {
  const mockContext = {} as ExecutionContext;

  it('delegates canActivate to the passport "jwt" strategy', () => {
    const spy = jest
      .spyOn(AuthGuard('jwt').prototype as any, 'canActivate')
      .mockReturnValue(true as any);

    const guard = new JwtAuthGuard();
    const result = guard.canActivate(mockContext);

    expect(spy).toHaveBeenCalledWith(mockContext);
    expect(result).toBe(true);
    spy.mockRestore();
  });
});
