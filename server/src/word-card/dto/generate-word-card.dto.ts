import { IsOptional, IsString, IsInt, Length, Min, Max } from 'class-validator';

/**
 * 生成单词卡片请求体（AI-601）。
 * 字段命名与前端 `GenerateWordCardDto`（`src/lib/types.ts`）对齐。
 */
export class GenerateWordCardDto {
  /** 兴趣 / 主题，驱动 LLM 选题（如「动物」「食物」「颜色」）。 */
  @IsString()
  @Length(1, 80)
  interest: string;

  /** 生成数量，1~10，缺省 5。 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  count?: number;

  /** 关联课程 id（可选）。 */
  @IsOptional()
  @IsString()
  courseId?: string;
}
