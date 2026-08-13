import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * 家长会话门禁（AI-702 之后）。
 *
 * 校验 `Authorization: Bearer <登录JWT>`，且 payload `role === 'parent'`。
 * 家长身份直接由登录 JWT 的 role 字段承载，不再通过 PIN 换取独立会话令牌。
 * 因此儿童（child JWT）无法调用审批/目录 CRUD 等家长域端点。
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
