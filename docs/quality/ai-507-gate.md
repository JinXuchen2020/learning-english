# AI-507 质量门报告 — 家长报告 Dashboard

- **Phase**: ai-507
- **Stack**: node-ts (NestJS 10 + TypeORM + better-sqlite3)
- **Branch**: feat/ai-507（提交不 push）
- **日期**: 2026-08-07
- **Gate 文件**: `.quality-gate.json`（扁平，`cleared:true`，`enforced:true`）

## 四道质量门结论

| 门 | 结论 | 关键证据 |
|----|------|----------|
| consistency | ✅ PASSED | `nest build` 0 错误；jest 76 suites / 640 tests 全绿（含 AI-507 新增 2 控制器用例）；frontend `tsc` 0 错误 + vitest 8 files / 75 tests 全绿（含 `lib/weekly.spec` 11 用例）；全栈契约对齐（后端 `WeeklyReportData` 镜像进 `src/lib/types.ts`，`GET /api/ai/report/weekly/preview` 与 `getWeeklyReport` 入参 `userId`/`weekStart` 一致）；无新增依赖 |
| tests | ✅ PASSED | **unit**: 后端 `ai-weekly-report.controller.spec`（preview 透传 `userId`/`weekStart` 给 `buildWeeklyReport` + 缺 `userId` 抛 `BadRequestException`，共 2 例）；前端 `lib/weekly.spec`（UTC 周一起点/±7 天导航/跨月跨年，11 例）。**e2e/bdd**: `parent-report.feature` 3 scenarios / 17 steps 全绿（趋势图 7 柱 + 6 指标卡 + 弱项 Cat,Dog + 建议下钻 `/practice?focusWord=Cat` + 上周切换 label 含 `2026-07-27`）；`page.route` 模拟 preview 端点，真实后端注册新用户走 AuthGate 客户端导航 |
| review | ✅ PASSED | 0 open。弱项下钻复用既有 `/practice` 的 `focusWord` query param，改动最小向后兼容；趋势图用原生 SVG（零新依赖）而非图表库；AuthGate 页禁 `page.goto`，经 TabNav 客户端点击保内存 token；mock 端点回显请求 `weekStart` 使周切换 label 真实；无裸 console |
| optimization | ✅ PASSED | 0 open。无 stub；不引入新依赖（`TrendChart` 自绘 SVG + `lib/weekly` UTC 日期纯函数）；`GET preview` 直接复用 AI-506 `buildWeeklyReport` 聚合，不重复统计；前端仅在加载/周切换时请求一次，无轮询 |

## 本次新增/修改文件

**后端**
- `server/src/ai/ai-weekly-report.controller.ts` — 新增 `GET weekly/preview`（手动校验 `userId`，调用 `buildWeeklyReport`）
- `server/src/ai/ai-weekly-report.controller.spec.ts` — 2 个控制器用例

**前端**
- `src/lib/types.ts` — 镜像 `WeeklyReportData` / `WeeklyReportMetrics` / `MasteryTrendPoint` / `DailySummary`
- `src/lib/api.ts` — `getWeeklyReport(userId, weekStart?)`
- `src/lib/weekly.ts`（新）+ `src/lib/weekly.spec.ts`（新，11 用例）— UTC 日期纯函数
- `src/components/TrendChart.tsx`（新）— 轻量 SVG 趋势图
- `src/app/parent-report/page.tsx`（新）— Dashboard 页（6 指标卡 + 趋势图 + 弱项 Top10 下钻 + AI 建议 + 周切换）
- `src/components/TabNav.tsx` — 新增「报告」Tab（第 7 项）
- `src/app/practice/page.tsx` — 支持 `focusWord` 跳转弱项词
- `src/e2e/features/parent-report.feature`（新）+ `support/pages/parent-report.ts`（新）+ `step-definitions/parent-report.steps.ts`（新）— 3 scenarios

**文档**
- `features/ai-507.md`（设计文档）
- `docs/quality/ai-507-gate.md`（本报告）
- `features/backlog.md` — AI-507 → `done`

## 后续可选

- 真实接入 `buildWeeklyReport` 输出（当前 E2E 用 mock 端点；生产路径已由 AI-506 单测覆盖）。
- 周报分享/导出（PDF 或图片）可作为后续 feature。
