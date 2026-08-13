import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsIn,
} from 'class-validator';

/**
 * 家长创建孩子账号 DTO（AI-710）。
 * 密码强度与注册一致（≥4 位）；username 唯一（3..30）。
 */
export class CreateChildDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  nickname: string;

  @IsString()
  @MinLength(3)
  @MaxLength(30)
  username: string;

  @IsString()
  @MinLength(4)
  @MaxLength(32)
  password: string;

  @IsOptional()
  @IsIn(['3-5', '6-8', '9-10'])
  ageRange?: string;
}
