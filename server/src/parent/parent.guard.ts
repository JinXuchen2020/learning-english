import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * 家长会话门禁（AI-702，取代 AI-701 的 `ParentGuard` 临时明文 token 方案）。
 *
 * 校验 `Authorization: Bearer <家长会话JWT>`，且 payload `role === 'parent'`。
 * 家长会话 JWT 由 `ParentService.signParentToken` 在 PIN 验证通过后签发（15 分钟过期），
 * 与 child JWT（`role` 缺省）完全分离，因此儿童（child JWT）无法调用审批/目录 CRUD 端点。
 *
 * 不再读取 `x-parent-approval` 头、不再继承 `JwtAuthGuard`、不再依赖明文 dev token。
 */
@Injectable()
export class ParentGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers?.authorization;
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
      return false;
    }

    try {
      const payload = this.jwtService.verify<{ sub: string; role?: string }>(
        auth.slice('Bearer '.length),
      );
      if (payload?.role !== 'parent') {
        return false;
      }
      req.user = { userId: payload.sub, role: 'parent' };
      return true;
    } catch {
      return false;
    }
  }
}
