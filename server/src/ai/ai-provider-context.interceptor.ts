import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import { aiContextStorage, AiProviderContext } from './ai-provider.context';
import { ProviderConfigService } from './provider-config/provider-config.service';

/**
 * 全局拦截器（AI-705）：在每个请求入口把「effective parent」写入 AsyncLocalStorage，
 * 供 `AiProviderRouter` 选择家长账号配置的默认 provider。
 *
 * 解析规则：
 * - 无 / 非法 Authorization → 上下文置空（router 回退系统默认）；
 * - `role==='parent'` → 自身 userId；
 * - child / 无角色 → 查 `User.parentId`（null 则置空）；
 * - 任何异常 → 置空（绝不抛错，保证不影响其他端点）。
 *
 * 这是「破坏性改动 AI_PROVIDER_TOKEN 单例」的安全网：默认路径与改动前一致（现回退 DB 系统默认）。
 */
@Injectable()
export class AiProviderContextInterceptor implements NestInterceptor {
  constructor(
    private readonly jwtService: JwtService,
    private readonly providerConfigService: ProviderConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx: AiProviderContext = {};
    const req = context.switchToHttp().getRequest();
    const auth = req?.headers?.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      try {
        const payload = this.jwtService.verify<{ sub?: string; role?: string }>(
          auth.slice('Bearer '.length),
        );
        // 仅同步写入 userId/role；parent 归属解析（child→parentId）交由
        // AiProviderRouter 异步完成，避免 async 拦截器返回类型冲突。
        ctx.userId = payload?.sub;
        ctx.role = payload?.role;
      } catch {
        ctx.userId = undefined;
      }
    }
    return aiContextStorage.run(ctx, () => next.handle());
  }
}
