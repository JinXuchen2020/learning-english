import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

/** 记录单词练习尝试请求体（AI-602 增强：加校验，替代原 raw any）。 */
export class RecordWordAttemptDto {
  @IsString()
  @IsNotEmpty()
  wordId: string;

  @IsBoolean()
  correct: boolean;
}
