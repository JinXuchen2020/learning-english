import { Body, Controller, Param, Post } from '@nestjs/common';
import { GeneratePlanDto } from './dto/generate-plan.dto';
import { SavePlanDto } from './dto/save-plan.dto';
import { ApplyPlanDto } from './dto/apply-plan.dto';
import { PlanService } from './plan.service';
import { GeneratePlanResponse } from './plan.types';

/**
 * 学习计划生成/持久化控制器（AI-202 生成 + AI-206 保存/应用）。
 *
 * 路由：`@Controller('ai/plan')` + 全局前缀 `api`：
 *  - `POST /api/ai/plan/generate` — 生成（不落库）
 *  - `POST /api/ai/plan/save` — 落库草稿（返回 id）
 *  - `POST /api/ai/plan/:id/apply` — 应用（置 applied + 写 daily_tasks）
 *
 * 按 `docs/ai-integration.md` 契约，`childId` 由 body 传入，本组接口**不加**
 * `JwtAuthGuard`（apply 接口补鉴权按计划文档留待后续，本 feature 不引入）。
 *
 * 请求体经全局 `ValidationPipe`(whitelist+transform+forbidNonWhitelisted) 校验，
 * 非法入参自动返回 400。
 */
@Controller('ai/plan')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  @Post('generate')
  generate(@Body() dto: GeneratePlanDto): Promise<GeneratePlanResponse> {
    return this.planService.generatePlan(dto);
  }

  @Post('save')
  save(@Body() dto: SavePlanDto) {
    return this.planService.savePlan(dto);
  }

  @Post(':id/apply')
  apply(@Param('id') id: string, @Body() dto: ApplyPlanDto) {
    return this.planService.applyPlan(id, dto.confirm ?? false);
  }
}
