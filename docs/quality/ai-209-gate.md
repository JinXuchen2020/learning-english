# 质量门报告 — AI-209 计划进度回写

> 日期: 2026-08-05
> 分支: `feat/ai-209`（自 `feat/ai-208` 切出，未 push）
> 阶段: M2 学习计划闭环（最后一环）

## 一、功能概述

AI-209 完成 M2 学习计划闭环的最后一环：

1. **后端回写**：`TasksService.completeTask` 注入 `StudyPlanDay` 仓库，完成任务且该 `DailyTask` 带 `planDayId` 时，幂等回写 `study_plan_days.isDone = true`（复用 AI-206 `replacePlanTasks` 写入的 `planDayId` 关联；全局种子任务 `planDayId` 为空则不回写，互不污染）。
2. **后端完成度端点**：`PlanService.getStatus(childId)` 取该 childId 最近一份 `applied` 计划（按 `updatedAt DESC`），`relations(['days'])` 加载明细并统计 `isDone` 完成度，返回 `{ hasPlan, totalDays, doneDays, completionRatio, planId?, appliedAt? }`；无 applied 计划时返回 `hasPlan:false`（200，前端据此隐藏卡片）。
3. **前端展示**：`src/app/page.tsx` Home 加载时并行拉取 `getPlanStatus(user.id)`，仅 `hasPlan` 时渲染 `data-component=PlanProgress` 卡片（`ProgressRing` 环形进度 + "已完成 X/Y 天"）；`handleCompleteTask` 成功后并行刷新 `progress` + `planStatus`，完成度实时递增。

## 二、质量门证据

### consistency（一致）— PASSED
- `npx tsc --noEmit`（前端）→ 0 错误
- `npx vitest run`（前端）→ **29/29 全绿**（lib/plan.spec 14 + lib/api.spec 11 + lib/logger.spec 4）
- `next build`（前端）→ 成功，`/plan` 路由 6.08 kB，`.next` 含 `PlanProgress`/`ai/plan/status`
- 前后端字段对齐：前端 `PlanStatusResponse` ↔ 后端 `PlanStatusResult`；`childId` 全程一致（`useAuth().user.id` ↔ `study_plans.userId`）

### tests（测试）— PASSED
- 后端 `jest`（server）：**31/31 全绿**
  - `tasks.service.spec.ts` 新增：`completeTask` 回写三分支（plan 任务带 planDayId→回写 / 非 plan 任务→不回写 / 已完成幂等）
  - `plan.service.spec.ts` 新增：`getStatus`（有 applied 计划→hasPlan=true 统计 done/total / 无 applied 计划→hasPlan=false）
- 前端 `vitest`：**29/29**（api.spec 新增 `getPlanStatus` 成功解析 + 空响应兜底）
- E2E（cucumber + Playwright，系统 Edge，免 Chromium 下载）：**13 scenarios / 121 steps 全绿**
  - 新增 `plan-progress.feature` 2 scenarios：① 应用计划后 Home 展示 `PlanProgress` 完成度（0/N）；② 完成所有每日任务后 `PlanProgress` 完成度递增
  - 11 个既有场景（含 AI-207/208）全绿，导航经 client-side TabNav 点击保 token

### review（评审）— PASSED
- 0 open issue；空安全（`plan.days ?? []`、`completionRatio` 分母 0 兜底）
- 回写幂等：仅 `task.planDayId` 存在才回写，不污染全局种子任务
- 错误隔离：`getPlanStatus` 失败被 `load()` try/catch 吞掉仅记 logger，不阻断首页其余数据
- 复用 AI-206 `planDayId` 关联，无重复造轮子；`data-component`/`button[data-action]` 钩子一致；生产代码无裸 console

### optimization（优化）— PASSED
- 0 open issue；`getStatus` 单 `findOne` + `relations(['days'])` 一次查询统计，无 N+1
- 首页 `Promise.all` 并行拉取 4 路数据；`completeTask` 后并行刷新 `progress + planStatus`
- `PlanProgress` 仅 `hasPlan` 时渲染，无计划用户零开销

## 三、踩坑记录

1. **E2E 陈旧构建**：首个 E2E 跑 AI-209 新场景全失败（`PlanProgress` 不在 DOM）。根因是 `next start` 起的是 AI-208 时期的旧生产构建（`.next` 不含 `PlanProgress`/`ai/plan/status`）。重建 `next build` + 强制 `Stop-Process` 旧 `next start`（`kill` 在 Git Bash 无 Windows 权限）+ 重启后，13/13 全绿。**教训**：改了 `page.tsx`/`api.ts` 后必须 `next build` 并重启 `next start`（勿用 `npm run dev`，会触发批量删防护），且验证 `.next` 含新组件再跑 E2E。
2. **E2E step 缺 `When` 导入**：`home.steps.ts` 新增 `When(...)` step 但仅 `import { Then }`，导致 cucumber 加载即 `ReferenceError: When is not defined`。已补 `import { Then, When }`。

## 四、提交内容（`feat/ai-209`，未 push）

- 后端：`tasks.service.ts`（注入 StudyPlanDay + completeTask 回写）、`tasks.module.ts`（forFeature 注册 StudyPlanDay）、`plan.types.ts`（+PlanStatusResult）、`plan.service.ts`（getStatus）、`plan.controller.ts`（GET status）、`tasks.service.spec.ts` / `plan.service.spec.ts`（新增用例）
- 前端：`lib/types.ts`（PlanStatusResponse）、`lib/api.ts`（getPlanStatus）、`app/page.tsx`（PlanProgress 卡 + 并行刷新）、`lib/api.spec.ts`（getPlanStatus 用例）、`e2e/features/plan-progress.feature`、`e2e/support/pages/home.ts`、`e2e/step-definitions/home.steps.ts`
- 文档：`.quality-gate.json`、本报告、`docs/ai-integration.md`（status 端点 + Home 完成度卡）、`features/backlog.md`（AI-209 → done）

## 五、下一步

M2 学习计划链（`feat/ai-206` → `feat/ai-207` → `feat/ai-208` → `feat/ai-209`）全部本地提交未 push。可选：继续 M3（AI 每日口语训练）或 push 整条链。
