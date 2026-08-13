import { IsString, MinLength, MaxLength } from 'class-validator';

/**
 * 家长认领已有孩子 DTO（AI-710）。
 * 校验孩子密码通过后，把孩子的 parentId 指向当前家长。
 */
export class ClaimChildDto {
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  username: string;

  @IsString()
  @MinLength(4)
  @MaxLength(32)
  password: string;
}
