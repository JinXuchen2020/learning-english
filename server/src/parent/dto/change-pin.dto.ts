import { IsString, Matches } from 'class-validator';

/** 修改家长 PIN（AI-702）：旧 PIN 校验 + 新 PIN（4 位数字）。 */
export class ChangePinDto {
  @IsString()
  @Matches(/^\d{4}$/, { message: '旧 PIN 必须是 4 位数字' })
  oldPin: string;

  @IsString()
  @Matches(/^\d{4}$/, { message: '新 PIN 必须是 4 位数字' })
  newPin: string;
}
