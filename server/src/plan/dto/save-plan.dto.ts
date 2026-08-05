import { IsObject, IsUUID } from 'class-validator';
import { GeneratedPlan } from '../plan.types';

/**
 * `POST /api/ai/plan/save` 请求体（AI-206）。
 *
 * 仅携带「把哪份计划存给哪个孩子」所需的最小信息：
 *  - `childId`：计划归属用户（`study_plans.userId`）。
 *  - `plan`：AI-202 生成的 `GeneratedPlan`（宽松结构）。其**结构合法性**由
 *    `PlanService.savePlan` 调 AI-204 的 `validatePlan` 兜底校验（class-validator
 *    无法直接校验含索引签名的宽松对象），不合法时返回 400。
 */
export class SavePlanDto {
  @IsUUID('4')
  childId: string;

  @IsObject()
  plan: GeneratedPlan;
}
