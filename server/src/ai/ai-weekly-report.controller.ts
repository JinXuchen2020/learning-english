import { Controller, Post, Body, Get, Query, BadRequestException } from '@nestjs/common';
import { GenerateWeeklyReportDto } from './generate-weekly-report.dto';
import { WeeklyReportService, WeeklyReportSendResult, WeeklyReportData } from './weekly-report.service';

/**
 * 家长周报控制器（AI-506，M5 报告接口）。
 *
 * 路由（全局前缀 `api`）：`POST /api/ai/report/weekly`
 *  - 聚合儿童一周学习统计、渲染 HTML 周报、发送给家长邮箱（落 `ai_parent_email_logs` 可追溯）。
 *
 * 鉴权：**不加 `JwtAuthGuard`**——与 AI-502 `AiReportController`（`POST /api/ai/report/daily`）
 * 保持一致；userId 由请求体传入，待全局鉴权落地后统一收紧。家长可视化 Dashboard 属 AI-507。
 */
@Controller('ai/report')
export class AiWeeklyReportController {
  constructor(private readonly weeklyReportService: WeeklyReportService) {}

  @Post('weekly')
  async weekly(@Body() dto: GenerateWeeklyReportDto): Promise<WeeklyReportSendResult> {
    return this.weeklyReportService.generateAndSendWeeklyReport(dto.userId, {
      weekStart: dto.weekStart,
      recipientEmail: dto.recipientEmail,
    });
  }

  /**
   * 家长 Dashboard 只读预览（AI-507）：聚合儿童一周学习数据为 `WeeklyReportData`，
   * **不发送邮件**（与 `POST weekly` 的发送语义区分）。
   * 路由 `GET /api/ai/report/weekly/preview?userId=&weekStart=`。
   * 与 AI-502/504/506 同口径：不加 guard，userId 由 query 传入（待全局鉴权收紧）。
   */
  @Get('weekly/preview')
  async preview(
    @Query('userId') userId: string,
    @Query('weekStart') weekStart?: string,
  ): Promise<WeeklyReportData> {
    if (!userId || !userId.trim()) {
      throw new BadRequestException('userId is required');
    }
    return this.weeklyReportService.buildWeeklyReport(userId, weekStart);
  }
}
