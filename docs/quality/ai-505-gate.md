# AI-505 质量门报告

> Feature: AI-505 — 每日 AI 报告自动生成触发
> 分支: feat/ai-505（基于 feat/ai-504）
> 日期: 2026-08-07
> 栈: node-ts (NestJS 10 + TypeORM + better-sqlite3)

## 1. 实现摘要

- **Trigger A（完成任务联动）**：`TasksService.completeTask` 在新完成（`!alreadyCompleted`）落库后调用新增私有方法 `maybeTriggerReport(userId)`：调 `getDailyTasks(userId)` 判定「当日全部任务已完成（且至少一条）」后，调 `AiReportService.generateDailyReport(userId)` 生成当日报告。整段 `try/catch` 兜底，报告生成失败仅 `logger.warn`，**不影响任务完成主流程**。
  - `AiModule` 已由 `@Global` 导出 `AiReportService`（新加入 `exports`），`TasksModule` 无需 import 即可注入，无循环依赖。
- **Trigger B（每日 20:00 扫描）**：新增 `ReportSchedulerService`（`@Injectable`，注册进 `AiModule`）：
  - `runDailySweep()` 遍历 `users` 表每个用户调 `generateDailyReport`，逐用户 `try/catch` 容错；
  - `computeMsUntilNext(hour, now)` 纯函数计算到下一个目标时刻的延迟；
  - `onModuleInit()` 在 `NODE_ENV!=='test'` 且 `REPORT_SWEEP_ENABLED!=='false'` 时启动 `setTimeout`+`setInterval` 每日调度；`onModuleDestroy()` 清除定时器。
  - `AiModule.forFeature` 追加 `User` 实体（与 `UsersModule` 重复注册同实体仓库无冲突），供 `userRepo` 注入。
- **幂等复用**：两个触发器都依赖 AI-502 `generateDailyReport` 的当日幂等（已有报告直接返回），保证「完成条件触发一次；不重复生成」。
- **不引入新依赖**：用轻量 `setTimeout/setInterval` 自实现调度，避免引入 `@nestjs/schedule` 的安装/lock/测试复杂度。

## 2. 一致性（consistency）

- `nest build` 0 错误（修复了 `ai.module.ts` 因合并产生的 `AiReportService` 重复 import）。
- 全量 `jest` 72 suites / 615 tests 全绿（含 AI-505 新增用例）。
- 纯后端触发逻辑，无新增 HTTP 路由、无前端改动；无全栈契约新增。

## 3. 测试（tests）

### 单元测试（jest）
- **扩展 `tasks.service.spec.ts`**（注入 `AiReportService` 假对象，4 个新用例）：
  - 完成当日全部任务（新完成）→ 触发 `generateDailyReport` 1 次，参数为该 userId；
  - 完成一项但非全部完成 → 不触发；
  - 完成已完成的任务（alreadyCompleted）→ 不触发；
  - 当日零任务 → 不触发。
- **新增 `report-scheduler.service.spec.ts`**：
  - `computeMsUntilNext`：当前 < 目标 → 到今日目标延迟；当前 ≥ 目标 → 到明日（约 23h/24h）；整点 → 顺延明日；
  - `runDailySweep`：遍历所有用户各调 1 次；无用户不调；单用户失败不中断整轮且不 reject（逐用户容错）；
  - 调度生命周期：fake timers 验证 `start` 注册定时器、`stop` 清除、到点触发一次 `runDailySweep`。

### BDD/E2E
- **豁免（约束 #6）**：本 feature 为纯后端触发逻辑，**无新增 UI 旅程**、**无新增 HTTP 路由**；报告展示旅程已由 AI-504（Home「今日 AI 小结」卡片）的 `home-dashboard.feature` 覆盖，无需重复。沿用 AI-501/AI-502 纯后端 E2E 豁免口径，设计文档 `features/ai-505.md` §6 已显式标注。

## 4. 审查（review）

- 0 open。副作用隔离（catch + warn，不阻塞任务完成）；无循环依赖（`AiModule` `@Global` 导出 `AiReportService`）；无裸 `console`（全部 `logger`，LOG-101 约定）；幂等复用 AI-502；`onModuleInit` 在 test 环境跳过避免定时器泄漏。

## 5. 优化（optimization）

- 0 open。无 stub/占位；不引入新依赖；调度轻量；`maybeTriggerReport` 空安全（零任务不触发）。

## 6. 质量门结论

四道通用门（consistency / tests / review / optimization）全部 PASSED，`cleared:true`。
