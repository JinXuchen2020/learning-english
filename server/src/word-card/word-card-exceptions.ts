import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 内容安全异常（AI-601）：生成的单词卡命中黑名单时抛出，映射为 HTTP 422。
 * 由 controller 透传给前端，前端据此提示「内容不安全，未生成」。
 *
 * @module word-card/word-card-exceptions
 */
export class ContentUnsafeException extends HttpException {
  constructor(keyword: string, field: string) {
    super(
      {
        code: 'CONTENT_UNSAFE',
        message: `内容安全校验未通过：命中敏感词 "${keyword}"（字段 ${field}）`,
        keyword,
        field,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
