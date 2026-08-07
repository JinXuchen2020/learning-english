import { Controller, Post, Body } from '@nestjs/common';
import { GenerateWeeklyReportDto } from './generate-weekly-report.dto';
import { WeeklyReportService, WeeklyReportSendResult } from './weekly-report.service';

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
}
