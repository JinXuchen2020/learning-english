import { IsOptional, IsInt, Min, Max } from 'class-validator';

/**
 * `POST /api/ai/plan/:id/generate-courses` 请求体（AI-801）。
 *
 * 字段经全局 `ValidationPipe`(whitelist+transform+forbidNonWhitelisted) 校验，
 * `wordsPerLesson` 越界（非 3..8 整数）自动返回 400。
 */
export class GenerateCoursesDto {
  /**
   * 每节单词数（3..8，缺省 5）。过少单词测验选项不足、过多超出儿童注意力。
   */
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(8)
  wordsPerLesson?: number;
}
