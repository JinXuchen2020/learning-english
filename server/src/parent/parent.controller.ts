import { Controller } from '@nestjs/common';
import { ParentService } from './parent.service';

/**
 * 家长域控制器（AI-702 之后）。
 *
 * 历史 PIN 相关端点（status / verify-pin / setup-pin / change-pin）已移除。
 * 家长身份统一由登录 JWT 的 `role === 'parent'` 承载，经 `ParentGuard` 校验。
 *
 * 本控制器保留为 AI-710「家庭绑定」等家长域端点提供落脚点。
 */
@Controller('parent')
export class ParentController {
  constructor(private readonly parentService: ParentService) {}
}
