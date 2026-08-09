import { IsOptional, IsString, IsInt, Min } from 'class-validator';

/** 修改奖励（家长，全字段可选）。 */
export class UpdateRewardDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsString()
  emoji?: string;

  @IsOptional()
  active?: boolean;
}
