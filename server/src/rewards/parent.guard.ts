import { Injectable, ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

/**
 * 家长审批门禁（AI-701 临时方案）。
 *
 * 先校验 JWT（当前复用孩子会话，因 AI-702 家长 PIN 登录尚未上线），再校验
 * `x-parent-approval` 请求头是否匹配 `PARENT_APPROVAL_TOKEN`（缺省 `parent-dev-token`）。
 *
 * ⚠️ 这是 AI-702「家长 PIN 锁 / 独立家长会话」上线前的占位门禁：真实家长身份
 * 应由 AI-702 的 PIN 会话签发，届时本 Guard 改为校验家长会话而非请求头。请勿在
 * 生产中依赖明文 token。
 */
@Injectable()
export class ParentGuard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const jwtOk = await super.canActivate(context);
    if (!jwtOk) return false;

    const req = context.switchToHttp().getRequest();
    const expected = process.env.PARENT_APPROVAL_TOKEN || 'parent-dev-token';
    const provided = req.headers['x-parent-approval'];
    return provided === expected;
  }
}
