import { IsString, Matches } from 'class-validator';

/** 校验 4 位数字家长 PIN（AI-702）。 */
export class VerifyPinDto {
  @IsString()
  @Matches(/^\d{4}$/, { message: 'PIN 必须是 4 位数字' })
  pin: string;
}
