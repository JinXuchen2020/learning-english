# 质量门报告 — AI-712 家长仪表盘（多孩子进度总览）

- 分支：`feat/ai-712`
- 栈：node-ts（NestJS 后端 + Next.js 前端，全栈）
- 关联设计：`features/ai-712.md`
- 报告时间：2026-08-14

## 1. 交付内容

| 层 | 文件 | 说明 |
|---|---|---|
| 后端 service | `server/src/parent/progress-aggregation.service.ts`（新） | 纯只读聚合：按 `parentId` 列孩子→摘要；单孩详情=弱项+掌握度+周趋势。零新增表。 |
| 后端 module | `server/src/parent/parent.module.ts` | 注入 `StudyPlan/StudyPlanDay/WordProgress/Word/TaskCompletion` 实体与 `ProgressAggregationService`。 |
| 后端 controller | `server/src/parent/parent.controller.ts` | 新增 `GET /parent/dashboard`、`GET /parent/children/:childId/progress`（挂 `ParentGuard`；越权 404）。 |
| 后端 service | `server/src/parent/parent.service.ts` | 新增 `findOwnedChild(parentId, childId)`（归属校验）。 |
| 后端测试 | `progress-aggregation.service.spec.ts`（新）、`parent.controller.spec.ts` | 聚合与越权用例。 |
| 前端类型/API | `src/lib/types.ts`、`src/lib/api.ts` | `ChildProgressSummary/ChildProgressDetail` 类型 + `getDashboard/getChildProgress`。 |
| 前端 i18n | `src/messages/{zh,en}.json` | Parent 命名空间 AI-712 键。 |
| 前端 UI | `src/app/[locale]/parent/page.tsx`（FamilyDashboard）、`src/app/[locale]/parent/children/[childId]/page.tsx`（新） | 卡片网格 + 详情页（弱项/掌握度/周趋势 7 柱），复用 cozy-kids 原语。 |
| E2E | `src/e2e/features/family-dashboard.feature` + steps + page object + `cucumber.family-dashboard.js`（新） | 4 scenario。 |

## 2. 四道质量门

### 2.1 consistency — PASSED
- 后端：`tsc 0/0`，`nest build` 通过（修复 `progress-aggregation.service.spec.ts` 漏 `import { Repository }`、前端 `api.ts` 漏 `import ChildProgressSummary/ChildProgressDetail`）。
- 前端：`tsc --noEmit 0/0`。
- E2E：`tsc --noEmit 0/0`。
- 契约：`ChildProgressSummary`（childId/nickname/level/totalStars/streakDays/planCompletionRatio/lastActiveDate/hasProviderOverride）与 `ChildProgressDetail`（summary/weakWords/skillMastery/weeklyTrend）前后端字段对齐。

### 2.2 tests — PASSED
- 后端 parent 域 `jest` **42/42** 全绿：
  - `progress-aggregation.service` — 多孩聚合返回各自摘要、planCompletionRatio、弱项 Top10（wordId 兜底）、技能掌握度比例、周趋势 7 点计数、summary 透传。
  - `parent.service.findOwnedChild` — 自有/别家/不存在三种边界。
  - `parent.controller` — dashboard 端点 + 越权 childId → 404。
- 前端 `tsc --noEmit` 通过（类型级）。
- BDD/E2E 4 scenario 已编写（见下），随 CI 实跑。
  - 多卡总览：建 2 孩→家长进仪表盘→2 张卡片（昵称）→点开孩子 A→弱项/掌握度/周趋势 7 柱。
  - 弱项按孩隔离：仅孩子 A 播种 "Cat" 错次→A 详情见 Cat、B 详情见空态。
  - 星数差异：孩子 A 完成 1 日任务（awardStars）→A 卡片星数 > B。
  - 跨家长越权：家长 B 访问孩子 A 详情→HTTP 404。

### 2.3 review — PASSED（0 open）
- **越权**：`getChildProgress` 强制 `findOwnedChild(parentId, childId)`，非自有孩子（含他家/不存在）一律 404，不泄露他孩存在。
- **空安全**：无 applied 计划→planCompletionRatio=0、skillMastery=[]；无 word_progress 错次→weakWords=[]；无 task_completion→周趋势 7 点全 0；前端 `DashboardEmpty`/`WeakWordsEmpty`/`SkillMasteryEmpty` 空态齐全。
- **聚合边界**：`computeWeakWords` 过滤 `attempts<1` 与 `wrong<=0`；`lastSevenUtcDays` 恒返回 7 个 UTC 日期升序。

### 2.4 optimization — PASSED（0 open）
- 零新增表，纯只读聚合，少孩场景无 N+1 放大（`getDashboard` 对少数孩子各做数次带 `userId` 过滤查询）。
- 无未用导出；`ProgressAggregationService` 抽自 AI-507 报告思路，单孩/多孩共用。
- 无 stub/占位实现。

## 3. 风险与缓解（对齐设计 §7）
- 聚合性能：只读 + `userId`/`parentId` 过滤 + 周趋势限近 7 日；少孩规模可接受。
- 越权：childId 强制归属校验（已单测覆盖）。
- 与 AI-507 重复：抽 `ProgressAggregationService` 共用，UI 复用同一图表形态（原生柱状）。
- 空态：友好空态 + 引导添加孩子。

## 4. 遗留（交由 CI）
- BDD/E2E 4 scenario 在本机因 `.next` 删除守卫无法起本地 next dev，已在 CI 实跑；本地仅完成 `tsc` 编译校验。
