import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

/** 手动调整某词下一次复习时间请求体（AI-605）。 */
export class ScheduleReviewDto {
  @IsString()
  @IsNotEmpty()
  wordId: string;

  /** 目标复习到期日（ISO 字符串）。 */
  @IsDateString()
  dueDate: string;
}
