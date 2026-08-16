import { IsOptional, IsUUID } from 'class-validator';

/**
 * 设置孩子的 provider 覆盖（AI-711）。
 *
 * `providerConfigId`：
 * - 非 null（uuid）→ 把孩子指到该配置（须归属该家长，否则 403/404）；
 * - null / 省略 → 清除覆盖，孩子回退家长默认。
 */
export class SetChildProviderDto {
  @IsOptional()
  @IsUUID('4', { message: 'providerConfigId 必须是 uuid' })
  providerConfigId?: string | null;
}
