import { IsString, IsInt, IsOptional, Min, IsNotEmpty } from 'class-validator';

/** 新增奖励（家长）。全局 ValidationPipe 已启用（whitelist+transform+forbidNonWhitelisted）。 */
export class CreateRewardDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(0)
  cost: number;

  @IsOptional()
  @IsString()
  emoji?: string;
}
