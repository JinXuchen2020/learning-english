# AI-704 质量门报告

> 分支: `feat/ai-704` | 栈: node-ts (NestJS 10 + Next.js 14 + better-sqlite3) | 提交方式: 仅 commit（不 push）
> 对应设计文档: `features/ai-704.md`

## 四道通用质量门结论

### 1. 一致性门（consistency）— PASSED

- 前端 `tsc --noEmit`：0 错误（`src/lib/api.ts` 补 `MakeupQueue`/`MakeupWordItem`/`MakeupTaskItem` 类型，`src/app/page.tsx` 的 `MakeupCard` 与 `handleCompleteMakeupTask` 经类型检查通过）。
- 后端 `tsc --noEmit`：0 错误（`progress.controller.ts`/`progress.service.ts` 新增 makeup 路由；`makeup.util.ts` 工具；`progress.module.ts` 暴露；`study-plan-day.entity.ts` 已含 `planId→StudyPlan.id` 外键）。
- `next build`：生产构建成功。
- 全栈契约对齐：`GET /api/progress/makeup` 返回 `{ weakWords: {wordId,wordText,meaning,mastery,lastPracticedAt}[], missedTasks: {planDayId,title,date}[] }`；前端 `src/lib/api.ts` 的 `MakeupQueue` 类型字段逐一对应，无 DTO 漂移。实机验证（E2E）Home 渲染 MakeupCard 且弱词下钻 `/practice?focusWord=<词>` 命中。
- 单元 + E2E 全绿（见下）。

### 2. 测试门（tests）— PASSED

**单元测试（后端逻辑）**：

- `server/src/progress/makeup.util.spec.ts`，15 个用例全绿（jest）：
  - `isYesterday`：跨午夜/跨月/跨年边界、空值、今日/未来排除。
  - `filterWeakWords`：纳入（昨日 + mastery<60）、排除（今日/m mastery≥60/due review 重合/缺 meaning 回落）、按 mastery 升序。
  - `mapMissedTasks`：仅取 isDone=false 且 date=昨日、null date 回落。
  - `toUtcDate`：UTC `YYYY-MM-DD` 锚定。
- `server/src/progress/progress.service.spec.ts`：整体 27/27（含 9 个 AI-704 用例，mock repo 覆盖）：昨日弱词入选、今日词排除、AI-605 due review 去重、未完成计划日入选、空库返回空数组；`completeMakeupTask` 标记 isDone + 积分 + 越权返回 false + 幂等。

**BDD/E2E**：`src/e2e/features/makeup.feature`，2 场景 / 10 步全绿（后端 `AI_PROVIDER=mock` + 播种昨日数据）：

- 弱词补学：登录 → Home 出现 MakeupCard 含昨日弱词 → 点击弱词 → 落到 `/practice?focusWord=<词>` → 全对作答至完成页。
- 未完成计划日：登录 → Home 出现 MakeupCard 含未完成计划日 → 点击「标记完成」→ 该项从卡片移除。

### 3. 代码审查门（review）— PASSED（0 open）

- 越权校验：`completeMakeupTask` 经 `studyPlanDay.plan.userId` 比对当前用户，非归属返回 `{success:false}`，不标记、不计分。
- 注入/安全：无用户输入直接拼 SQL；所有查询走 TypeORM 仓储参数化。
- 协同去重：弱词集合排除「已出现在 AI-605 到期复习（`getDueReviews` 返回 wordId 集合）」的词，保证不重复展示 / 不重复计分。
- 边界：空库 / 无昨日数据 → 队列为空数组，不报错，Home 不渲染 MakeupCard；`getMakeupQueue` 内部 try/catch 失败回落空队列，不影响首页其余卡片。
- 无新实体 / 无迁移：补学队列是实时视图，由现有 `word_progress` + `study_plan_days` 计算，`synchronize` 无 schema 变更。
- 日志：无裸 `console.*`（仅测试基础设施豁免）。
- 测试面：有逻辑分支的源码（makeup.util、progress.service）均有单测；UI 行为由 E2E 覆盖。

### 4. 优化门（optimization）— PASSED（0 open）

- 无 stub/占位代码；无临时调试输出。
- 错误处理统一：`getMakeupQueue` 失败静默回落空队列并 `logger.error`；`completeMakeupTask` best-effort（积分失败不影响 isDone 标记）。
- 删除/未用导出：无新增死代码；`MAKEUP_MASTERY_THRESHOLD`、`toUtcDate` 等均为实际使用常量/函数。

## 测试证据汇总

| 类型 | 文件 | 结果 |
|---|---|---|
| 后端单测 | `server/src/progress/makeup.util.spec.ts` | 15/15 通过 |
| 后端单测 | `server/src/progress/progress.service.spec.ts`（含 AI-704 用例） | 27/27 通过 |
| 后端全量单测 | `jest --config jest.config.js` | 789/789 通过 |
| 前端单测 | `vitest run` | 119/119 通过 |
| BDD/E2E | `src/e2e/features/makeup.feature` | 2 场景 / 10 步通过 |
| 类型检查 | 前端 + 后端 `tsc --noEmit` | 0 错误 |
| 生产构建 | `next build` | 成功 |

## 遗留风险 / 说明

- 「昨日」口径统一为 UTC `YYYY-MM-DD`（后端 `new Date().toISOString()` 减一天），与 `task_completions.date` / `study_plan_days.date` 既有 UTC 口径一致，避免时区漂移。
- 弱词补学走普通 `/practice`（每次正确尝试由 AI-701/605 正常计一次分），补学不额外加奖；未完成计划日因 `date=昨日` 不出现在今日 `daily_tasks`，故 `completeMakeupTask` 单独加一次 `TASK_COMPLETE` 分不与今日任务重复。
- E2E 种子：`server/src/scripts/seed-makeup.ts` 直写 `lastPracticedAt=昨日` 的 `word_progress` 行与 `date=昨日` 的 `study_plan_days` 行（确定性 UTC noon 锚定，规避午夜边界漂移），需 `SQLITE_PATH=e2e.sqlite` 与后端同库。
- 当前分支 `feat/ai-704` 未 push，由用户决定 merge/push。
