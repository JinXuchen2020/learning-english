import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { GeneratePlanDto } from './dto/generate-plan.dto';
import { SavePlanDto } from './dto/save-plan.dto';
import { ApplyPlanDto } from './dto/apply-plan.dto';
import { GenerateCoursesDto } from './dto/generate-courses.dto';
import { PlanService } from './plan.service';
import { GeneratePlanResponse, PlanStatusResult, GenerateCoursesResponse } from './plan.types';

/**
 * 学习计划生成/持久化控制器（AI-202 生成 + AI-206 保存/应用 + AI-209 完成度）。
 *
 * 路由：`@Controller('ai/plan')` + 全局前缀 `api`：
 *  - `POST /api/ai/plan/generate` — 生成（不落库）
 *  - `POST /api/ai/plan/save` — 落库草稿（返回 id）
 *  - `POST /api/ai/plan/:id/apply` — 应用（置 applied + 写 daily_tasks）
 *  - `GET  /api/ai/plan/status?childId=<uuid>` — 计划完成度快照（AI-209）
 *
 * 按 `docs/ai-integration.md` 契约，`childId` 由 body / query 传入，本组接口**不加**
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

  /**
   * 流式生成学习计划（AI-804）。
   *
   * 返回 `text/event-stream`：逐帧 `data: <PlanStreamEvent JSON>\n\n`。
   * 事件序列见 `PlanStreamEvent`（`start`/`token`/`progress`/`done`/`error`）。
   * 原非流式 `POST /api/ai/plan/generate` 保留（兼容 save 流程 / 无流式环境 / 测试）。
   *
   * 鉴权口径与 `generate` 一致：childId 由 body 传，本组接口暂不加 `JwtAuthGuard`。
   */
  @Post('generate/stream')
  async generateStream(
    @Body() dto: GeneratePlanDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // flushHeaders 让首帧尽快到达（部分 Node/代理会缓冲）；Express ServerResponse 携带该方法。
    (res as unknown as { flushHeaders?: () => void }).flushHeaders?.();

    const ac = new AbortController();
    const onClose = () => ac.abort();
    req.on('close', onClose);

    try {
      for await (const ev of this.planService.generatePlanStream(dto, ac.signal)) {
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      }
    } catch (e) {
      // generatePlanStream 内部已用 error 事件收尾；此处兜底再写一次以防未捕获异常。
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          code: 'AI_ERROR',
          message: (e as Error)?.message ?? '学习计划生成失败',
        })}\n\n`,
      );
    } finally {
      req.off('close', onClose);
      res.end();
    }
  }

  @Post('save')
  save(@Body() dto: SavePlanDto) {
    return this.planService.savePlan(dto);
  }

  @Post(':id/apply')
  apply(@Param('id') id: string, @Body() dto: ApplyPlanDto) {
    return this.planService.applyPlan(id, dto.confirm ?? false);
  }

  @Post(':id/generate-courses')
  generateCourses(
    @Param('id') id: string,
    @Body() dto: GenerateCoursesDto,
  ): Promise<GenerateCoursesResponse> {
    return this.planService.generateCoursesForPlan(id, dto.wordsPerLesson ?? 5);
  }

  @Get('status')
  getStatus(@Query('childId') childId: string): Promise<PlanStatusResult> {
    return this.planService.getPlanStatus(childId);
  }
}
