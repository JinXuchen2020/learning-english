import { Controller, Post, Body } from '@nestjs/common';
import { GenerateDailyReportDto } from './generate-daily-report.dto';
import { AiReportService, DailyReportResponse } from './ai-report.service';

/**
 * 每日 AI 报告控制器（AI-502，M5 报告接口）。
 *
 * 路由（全局前缀 `api`）：`POST /api/ai/report/daily`
 *  - 聚合当日学习统计（任务完成 / 单词练习 / 课程完成 / 口语尝试与平均分），
 *    生成（或返回已有）每日 AI 小结并落库 `ai_reports`（AI-501）。
 *
 * 鉴权：**不加 `JwtAuthGuard`**——与现有 `AiController`（`ai/speech`，AI-303）保持一致；
 * 该模块鉴权按计划文档「留待后续」，`userId` 由请求体传入（与 `speech-evaluate.dto.ts` 同口径）。
 * 已知限制（继承自 AI 模块约定）：userId 客户端传入、未做租户隔离，待全局鉴权落地后统一收紧。
 */
@Controller('ai/report')
export class AiReportController {
  constructor(private readonly reportService: AiReportService) {}

  @Post('daily')
  async daily(@Body() dto: GenerateDailyReportDto): Promise<DailyReportResponse> {
    return this.reportService.generateDailyReport(dto.userId, dto.date);
  }
}
