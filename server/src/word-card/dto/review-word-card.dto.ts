import { IsOptional, IsString, Length } from 'class-validator';

/** 审核（批准 / 驳回）请求体，携带可选审核备注。 */
export class ReviewWordCardDto {
  @IsOptional()
  @IsString()
  @Length(0, 200)
  reviewerNote?: string;
}
