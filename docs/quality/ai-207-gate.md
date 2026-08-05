# AI-207 质量门报告 — `/plan` 页面：学习计划向导表单

> 分支: `feat/ai-207` | 栈: node-ts (Next.js 前端 + NestJS 后端) | 提交: 本地 commit（不 push）
> 关联: AI-202（generate 接口）/ AI-205（内置模板降级）/ AI-206（save/apply）/ 约束 #6（首个带真实 UI 的 feature，BDD/E2E 必做）

## 一、实现摘要
- **向导页**：新增 `src/app/plan/page.tsx`（`"use client"` + `AuthGate` 包裹），`childId` 取自 `useAuth().user.id`（uuid，满足 DTO）。五组大触控卡片选择器——年龄段 / 等级 / 每日时长 / 兴趣（多选）/ 周数；选中态高亮 + `aria-pressed`；选择器 DOM 用 `button[data-field=...][data-value=...]` 便于 E2E 定位。
- **提交流**：`Button[data-action=generate]` 在 `validatePlanForm` 通过前 `disabled`（空表单禁用态，便于断言）；提交中 `data-component=PlanLoading`（Mascot thinking）；成功 `data-component=PlanPreview` 渲染 weeks→days→lessons；`degraded:true` 时显示 `data-component=PlanDegradedNote`「Foxy 用了一套现成计划」友好提示；接口报错显示错误提示而非白屏。
- **纯逻辑模块**：新增 `src/lib/plan.ts` 集中选择器常量（`PLAN_LEVELS`/`AGE_RANGES`/`DAILY_MINUTE_OPTIONS`/`INTEREST_OPTIONS`/`WEEK_OPTIONS`）+ `validatePlanForm(values): PlanFormErrors` + `isPlanFormValid(values)`（缺字段即返回对应报错文案）。
- **API/类型**：扩展 `src/lib/api.ts` 新增 `generatePlan(dto: GeneratePlanDto)`（`POST /api/ai/plan/generate`，带 Bearer token）；`src/lib/types.ts` 新增 `PlanSkillType`/`PlanLevel`/`PlanLesson`/`PlanDay`/`PlanWeek`/`GeneratedPlan`/`GeneratePlanResponse`/`GeneratePlanDto`。
- **导航**：`src/components/TabNav.tsx` 新增 `Plan` 标签（Sparkles 图标，href `/plan`）。
- **后端**：无新增代码，复用 AI-202/205/206 的 `POST /api/ai/plan/generate`（MockProvider 无 key 自动降级为内置模板计划，仍 200 + `degraded:true`）。

## 二、四道质量门
| 门 | 结论 |
|---|---|
| consistency | PASSED — `tsc --noEmit` 0 错误；`vitest` 17/17 全绿；`next build` 含 `/plan` 路由 OK；前后端字段对齐（后端 `GeneratePlanDto` ↔ 前端 `lib/types.ts` `GeneratePlanDto` + `lib/plan.ts` 常量，无破坏性变更）；纯展示页面由 E2E 覆盖，无全栈契约漂移 |
| tests | PASSED — 单元测试 2 文件：`lib/plan.spec.ts`(validatePlanForm 全空/各字段缺失/全合法 8 case) + `lib/api.spec.ts`(generatePlan 成功 POST 解析 + 400 抛 ApiError 2 case)；BDD/E2E 必做：`plan-wizard.feature` 2 scenarios（向导可见性+空表单禁用态 / 填完提交出预览含 weeks）全绿，全量 E2E 套件 8 scenarios/46 steps 全绿，浏览器走系统 Edge 免 Chromium 下载；免 key 经 MockProvider 降级 `degraded:true` 计划仍有效可渲染 |
| review | PASSED (0 open) — 空安全(`result?.plan?.weeks ?? []` / `error?` 回退)；错误映射(generate 失败显示友好错误而非白屏)；选择器常量提取 `lib/plan.ts` 无 magic value；`data-component` 钩子一致（PlanWizard/PlanForm/PlanLoading/PlanPreview/PlanDegradedNote）+ `button[data-field][data-value]`；生产代码无裸 `console.*`；`AuthGate` 包裹鉴权流 |
| optimization | PASSED (0 open) — 无 stub/调试残留；表单逻辑/常量集中 `lib/plan.ts` 纯逻辑可单测；提交按钮禁用态统一由 `isPlanFormValid` 驱动；统一错误展示；`PlanPreview` 空态保护（weeks 可能空数组） |

## 三、已知风险 / deferred 项
- **E2E 双服务在线**：BDD/E2E 需同时起前端(:3000)与后端(:4000)，用系统 Edge（`E2E_BROWSER_CHANNEL=msedge`）跑 Playwright，免 Chromium 下载。
- **token 保持**：`page.goto('/plan')` 会硬刷新重置 in-memory JWT → AuthGate 跳 `/login` 致向导不挂载；E2E 改为经 client-side `TabNav` 链接点击导航，保留 token。后续若有持久化 token（localStorage）可再简化。
- **generate 无鉴权（AI-206 deferred）**：前端照常带 Bearer，后端忽略；后端补 `JwtAuthGuard` 按计划文档留待后续。
- **展示与交互属 AI-208**：本 feature 仅向导 + 基础预览（weeks/days/lessons 渲染 + degraded 提示）；周计划卡片视图（每日颜色化）、「重新生成」、「应用此计划」、单日任务勾选属 AI-208。

## 四、测试证据
- `npx vitest run`（src/）→ 17 passed / 17 total（lib/plan.spec 8 + lib/api.spec 5 + lib/logger.spec 4）。
- `npx tsc --noEmit`（src/）→ 0 错误。
- `npm run e2e`（src/）→ 8 scenarios (8 passed) / 46 steps (46 passed)，其中 AI-207 的 `plan-wizard.feature` 占 2 scenarios。
- `next build` → 成功，含 `/plan` 路由。
- 生产代码（src/app、src/lib、src/components）无裸 `console.*`（grep 验证）。
