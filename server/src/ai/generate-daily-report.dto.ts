import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';

/**
 * `POST /api/ai/report/daily` 请求体（AI-502）。
 *
 * 鉴权沿用 AI 模块约定（不加 JwtAuthGuard，见 ai.controller.ts）：userId 由客户端传入，
 * 与 `speech-evaluate.dto.ts` 的 `dto.userId` 同口径；`date` 可选，缺省取服务端 UTC 当日。
 */
export class GenerateDailyReportDto {
  /** 报告归属儿童（必填）。 */
  @IsString()
  @IsNotEmpty()
  userId: string;

  /**
   * 报告日期 `YYYY-MM-DD`（可选）。缺省取服务端 UTC 当日，
   * 与 `task_completions.date` 的 UTC 口径一致。
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date 必须为 YYYY-MM-DD' })
  date?: string;
}
