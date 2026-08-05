import { Body, Controller, Post } from '@nestjs/common';
import { GeneratePlanDto } from './dto/generate-plan.dto';
import { PlanService } from './plan.service';
import { GeneratePlanResponse } from './plan.types';

/**
 * 学习计划生成控制器（AI-202）。
 *
 * 路由：`@Controller('ai/plan')` + 全局前缀 `api` → `POST /api/ai/plan/generate`。
 * 按 `docs/ai-integration.md` 契约，`childId` 由 body 传入，本接口**不加**
 * `JwtAuthGuard`（保持与文档 body 一致；AI-206 应用接口再决定鉴权）。
 *
 * 请求体经全局 `ValidationPipe`(whitelist+transform+forbidNonWhitelisted) 校验，
 * 非法入参自动返回 400；合法入参交给 `PlanService` 生成结构化计划（不落库）。
 */
@Controller('ai/plan')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  @Post('generate')
  generate(@Body() dto: GeneratePlanDto): Promise<GeneratePlanResponse> {
    return this.planService.generatePlan(dto);
  }
}
