import { IsString, Matches } from 'class-validator';

/** 首次设置家长 PIN（AI-702）：4 位数字。 */
export class SetupPinDto {
  @IsString()
  @Matches(/^\d{4}$/, { message: 'PIN 必须是 4 位数字' })
  pin: string;
}
