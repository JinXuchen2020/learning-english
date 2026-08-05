# AI-208 质量门报告 — `/plan` 页面：计划展示与交互

> 分支: `feat/ai-208` | 栈: node-ts (Next.js 前端 + NestJS 后端) | 提交: 本地 commit（不 push）
> 关联: AI-207（向导表单）/ AI-206（save/apply 端点）/ 约束 #6（带真实 UI 的 feature，BDD/E2E 必做）

## 一、实现摘要
- **颜色化周计划卡片**：`src/app/plan/page.tsx`（`"use client"` + `AuthGate` 包裹）的 `PlanPreview` 重写为每日颜色化卡片视图：`plan.weeks` → 每周 `PlanWeekCard` → 每天 `PlanDayCard`。每张日卡按 `planSkillColor(day.skillType)` 上色（左侧描边 + 14% 透明度底色），列出当日 lessons（带按技能类型着色的 `button` 徽标，`planLessonTypeLabel`/`planSkillColor` 驱动）；`formatPlanDay(day, index)` 负责标题兜底（`第 N 天`）+ lessonCount + skills 提取。
- **动作区**：底部两按钮——「重新生成」`button[data-action="regenerate"]`（`variant="secondary"`，复用 generate，带 `PlanLoading` + `PlanDegradedNote`）；「应用此计划」`button[data-action="apply"]`（`variant="success"`）。`handleApply` 流程：`savePlan` → `applyPlan` → 显示 `data-component="PlanAppliedSuccess"` 短暂提示 → `setTimeout(() => router.push('/'), 1200)` 跳转 Home；失败显示 `error` 提示而非白屏。
- **单日任务勾选**：每张日卡右侧 `button[data-action="toggle-day"][data-day-index=gi]`（gi = 跨周全局天索引，作 React key 稳定），带 `aria-pressed` 本地视觉态（`Set<number>` state 切换）。**持久化属 AI-209**，本 feature 仅视觉完成态，设计文档显式标注。
- **纯逻辑模块**：`src/lib/plan.ts` 新增 `PLAN_SKILL_COLORS`（vocab `#F59E0B` / listen `#3B82F6` / speak `#EC4899` / write `#10B981`）、`planSkillColor(skill?)`、`planSkillLabel(skill)`、`planLessonTypeLabel(lesson?)`、`formatPlanDay(day, index)` → `{label, color, lessonCount, skills}`（标题兜底 `第 N 天`，颜色取 `day.skillType` 或首 lesson 的 skillType）。集中颜色/标签映射，无 magic value。
- **API/类型**：扩展 `src/lib/api.ts` 新增 `savePlan(dto: SavePlanDto)`（`POST /api/ai/plan/save`）与 `applyPlan(id, dto?: ApplyPlanDto)`（`POST /api/ai/plan/:id/apply`，带 Bearer token）；`src/lib/types.ts` 新增 `SavePlanDto {childId, plan: GeneratedPlan}` / `SavePlanResponse {id, status}` / `ApplyPlanDto {confirm?}` / `ApplyPlanResponse {id, status, appliedDays, tasksCreated, appliedAt}`。
- **后端**：无新增代码，复用 AI-206 的 `POST /api/ai/plan/save`（`{id, status:'draft'}`）与 `POST /api/ai/plan/:id/apply`（`{id, status:'applied', appliedDays, tasksCreated, appliedAt}`）；生成仍用 AI-207 的 `POST /api/ai/plan/generate`（MockProvider 无 key 自动降级 `degraded:true` 仍 200）。
- **E2E 页面对象**：`src/e2e/support/pages/plan.ts` 扩展 `planDayCardCount()` / `isApplyVisible()` / `isRegenerateVisible()` / `clickApply()` / `waitAppliedSuccess()` / `toggleDay(index)` / `isDayDone(index)` / `waitHomeWithTasks()`（等待 `location.pathname==='/'` + `DailyTasks button` ≥1）；`src/e2e/step-definitions/plan.steps.ts` 扩展对应 step。

## 二、四道质量门
| 门 | 结论 |
|---|---|
| consistency | PASSED — `tsc --noEmit` 0 错误；`vitest` 27/27 全绿；`next build` 含 `/plan` 路由 OK（/plan 6.08 kB）；前后端字段对齐（后端 `SavePlanDto`/`ApplyPlanDto` ↔ 前端 `lib/types.ts` `SavePlanDto`/`SavePlanResponse`/`ApplyPlanDto`/`ApplyPlanResponse`，无破坏性变更）；纯展示页面由 E2E 覆盖，无全栈契约漂移 |
| tests | PASSED — 单元测试 2 文件：`lib/plan.spec.ts`（planSkillColor/planLessonTypeLabel/formatPlanDay 共 6 case，累计 14）+ `lib/api.spec.ts`（savePlan 成功 + 400 / applyPlan 成功 + 400 + 409，共 4 case，累计 9）；BDD/E2E 必做：`plan-display.feature` 3 scenarios（颜色化日卡+应用/重新生成可见 / 应用→已应用提示→Home 任务 / 单日勾选完成态）全绿，全量 E2E 套件 11 scenarios/88 steps 全绿，浏览器走系统 Edge 免 Chromium 下载；免 key 经 MockProvider 降级 `degraded:true` 计划仍有效可渲染 |
| review | PASSED (0 open) — 空安全(`result?.plan?.weeks ?? []` / `error?` 回退)；错误映射(apply 失败显示友好错误而非白屏)；颜色/标签/格式化逻辑集中 `lib/plan.ts` 无 magic value；`data-component` 钩子一致（PlanWizard/PlanForm/PlanLoading/PlanPreview/PlanDegradedNote/PlanDayCard/PlanAppliedSuccess）+ `button[data-action][data-day-index]`；生产代码无裸 `console.*`；`AuthGate` 包裹鉴权流 |
| optimization | PASSED (0 open) — 无 stub/调试残留；颜色化/格式化逻辑集中 `lib/plan.ts` 纯逻辑可单测；单日勾选本地视觉态不落库，显式标注持久化属 AI-209；统一错误展示；`PlanPreview` 空态保护（weeks 可能空数组） |

## 三、已知风险 / deferred 项
- **E2E 双服务在线**：BDD/E2E 需同时起前端(:3000)与后端(:4000)，用系统 Edge（`E2E_BROWSER_CHANNEL=msedge`）跑 Playwright，免 Chromium 下载。
- **token 保持**：`page.goto('/plan')` 会硬刷新重置 in-memory JWT → AuthGate 跳 `/login` 致页面不挂载；E2E 改为经 client-side `TabNav` 链接点击导航，保留 token。应用成功后同样 client-side `router.push('/')`，token 保留。
- **apply 重定向时序**：apply 成功后先显「已应用」提示再 `router.push('/')`，E2E 先等 `PlanAppliedSuccess` 再等 `Home`，避免竞态。
- **DB 持久化跨 E2E 运行**：`replacePlanTasks` 按 `planDayId` 先删后插，重复 apply 覆盖不增行；E2E 断言以「跳 Home + Home 渲染任务」为准，不依赖计数增量（避免 flaky）。
- **单日勾选不落库**：本 feature 仅视觉态；真正回写 `planDay.isDone` 属 AI-209，设计文档显式标注。

## 四、测试证据
- `npx vitest run`（src/）→ 27 passed / 27 total（lib/plan.spec 14 + lib/api.spec 9 + lib/logger.spec 4）。
- `npx tsc --noEmit`（src/）→ 0 错误。
- `npm run e2e`（src/）→ 11 scenarios (11 passed) / 88 steps (88 passed)，其中 AI-208 的 `plan-display.feature` 占 3 scenarios。
- `next build` → 成功，含 `/plan` 路由（/plan 6.08 kB）。
- 生产代码（src/app、src/lib、src/components）无裸 `console.*`（grep 验证）。
