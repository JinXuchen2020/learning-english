# AI-206 质量门报告 — 计划持久化与"应用计划"

> 分支: `feat/ai-206` | 栈: node-ts (NestJS + TypeORM) | 提交: 本地 commit（不 push）
> 关联: AI-201（实体）/ AI-202（generate）/ AI-204（validatePlan）/ 现有 TasksModule

## 一、实现摘要
- **持久化草稿**：新增 `POST /api/ai/plan/save`（`SavePlanDto { childId(uuid), plan: GeneratedPlan }`）。服务端复用 AI-204 的 `validatePlan` 校验结构，不合法 → 400；合法 → 落库 `study_plans`(status=`draft`) + `study_plan_days`(cascade)，返回 `{ id, status }`。
- **应用计划**：新增 `POST /api/ai/plan/:id/apply`（`ApplyPlanDto { confirm?: boolean }`）。找不到 → 404；草稿 → 置 `applied`、按 `dayIndex` 从今天起填 `study_plan_days.date`、按天写入 `daily_tasks`（带 `userId`/`planDayId`/`date`），旧任务先清后写；已 `applied` 且 `confirm!==true` → 409 `{ code:'PLAN_ALREADY_APPLIED', needsConfirm:true }`（前端弹确认后带 `confirm:true` 重应用）。
- **多租户隔离（按用户决策 Q2）**：`daily_tasks` 扩展可空 `userId`/`planDayId`(Index)/`date`；`getDailyTasks(userId)` 合并「全局种子(userId IS NULL) + 该用户当日计划任务」，计划任务不泄漏给其他用户。
- **复用**：`TasksService` 新增 `replacePlanTasks(userId, planDayIds, entries)`（先 `delete userId+planDayId IN(...)` 再批量 `save`）；`TasksModule` 导出 `TasksService`，`PlanModule` 导入以注入 `PlanService`，无循环依赖。

## 二、四道质量门
| 门 | 结论 |
|---|---|
| consistency | PASSED — `tsc --noEmit` 0 错误；`jest` plan+tasks 98/98 全绿；`GeneratePlanResponse` / generate 契约未变（新增独立 save/apply 端点，无破坏性）；纯后端无全栈前端契约漂移 |
| tests | PASSED — 单元测试 6 文件：`plan.service.spec.ts`(+save/apply 分支：落库/非法拒绝/404/重复确认/重应用)、`tasks.service.spec.ts`(+getDailyTasks 多租户合并 + replacePlanTasks 先删后插)、`plan.controller.spec.ts`(装配+DTO 校验)、`save-plan.dto.spec.ts`、`apply-plan.dto.spec.ts`、`plan.module.spec.ts`(建表含新列)；BDD/E2E 0 场景（纯后端 API，按约定 #6 豁免，/plan 页旅程属 AI-207/208） |
| review | PASSED (0 open) — 空安全(`weeks??[]` / `days??[]` / `plan.days??[]` / 日期 `day.date!`)；错误映射(404/409/400 语义清晰)；多租户隔离(`getDailyTasks` where 合并 + `replacePlanTasks` 按 planDayId 精准清理)；魔法值提取(`iconForSkill`/`addDays`/`firstSkillType`/`summarizeDay`)；无裸 console；无死代码 |
| optimization | PASSED (0 open) — 复用 AI-204 `validatePlan` 不重复校验；`replacePlanTasks` 批量先删后插避免重复行；`date` 统一 UTC `YYYY-MM-DD` 口径（与 `task_completions.date` 一致）；无 stub/占位 |

## 三、已知风险 /  deferred 项
- **鉴权 deferred**：本 feature 不引入 `JwtAuthGuard`，沿用 AI-202「`childId` 由 body 传入」契约；apply 接口补鉴权按计划文档留待后续（已在设计文档与集成文档标注）。前端 `save`/`apply` 为受信任的内部调用，后续接入 auth 时需同步调整。
- **生产 schema 迁移**：本地/CI 用 `synchronize` 自动建列；若生产走显式迁移，需在部署前补 `daily_tasks` 三列迁移（本项目当前统一用 synchronize，风险低）。
- **重应用任务清理边界**：`replacePlanTasks` 仅清理「本计划」(`planDayId IN(...)`) 的旧任务，保留其他计划任务（当前单孩子单计划场景足够）。

## 四、测试证据
- `npx jest src/plan src/tasks` → 98 passed / 98 total。
- `npx tsc --noEmit` → 0 错误。
- 全 server `jest` 见 Phase 4 运行结果（AI-205 为 292，AI-206 增量 +6 文件若干 case）。
