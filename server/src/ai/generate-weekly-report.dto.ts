import { IsString, IsOptional, IsEmail } from 'class-validator';

/**
 * `POST /api/ai/report/weekly` 请求体（AI-506）。
 *
 * 与 AI-502 `GenerateDailyReportDto` 同口径：userId 由请求体传入（AI 模块未加 guard，
 * 待全局鉴权落地后收紧）；`recipientEmail` 为可选覆盖，缺省时回退用户 `parentEmail`。
 */
export class GenerateWeeklyReportDto {
  @IsString()
  userId: string;

  /** 周起始日 YYYY-MM-DD（Monday）；缺省由服务按 UTC 当日推算所在周。 */
  @IsOptional()
  @IsString()
  weekStart?: string;

  /** 可选收件人邮箱覆盖（家长邮箱）；缺省用 `user.parentEmail`。 */
  @IsOptional()
  @IsEmail()
  recipientEmail?: string;
}
