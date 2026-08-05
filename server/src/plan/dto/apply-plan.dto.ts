import { IsBoolean, IsOptional } from 'class-validator';

/**
 * `POST /api/ai/plan/:id/apply` 请求体（AI-206）。
 *
 * `confirm` 仅用于「重复应用」二次确认：计划已 `applied` 时，
 * 不带 `confirm`（或 `false`）→ 接口返回 409 `needsConfirm`，前端弹确认；
 * 带 `confirm:true` → 覆盖式重应用（先清旧任务再写）。
 */
export class ApplyPlanDto {
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
