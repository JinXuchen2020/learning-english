import { IsArray, ArrayNotEmpty, IsString } from 'class-validator';

/** `POST /api/scan/confirm` 请求体：将指定 pending 卡片加入生词本。 */
export class ConfirmScanDto {
  /** 待加入生词本的卡片 id 列表（非空字符串数组）。 */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];
}
