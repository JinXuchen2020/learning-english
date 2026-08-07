# AI-504 · 质量门报告

> 模块：M5「AI 错题与进度报告」· feature-builder 阶段交付
> 分支：`feat/ai-504`（基于 `feat/ai-503`）
> 质量门：consistency / tests / review / optimization 四道全 PASSED（flat `.quality-gate.json`，pre-commit hook 放行）

## 1. 交付内容
- **纯前端消费层**，不新增后端接口（backlog 约束）；后端契约由 AI-502 定义、提示由 AI-503 精炼。
- `src/lib/types.ts`：新增 `DailyReportResponse` + `DailyReportStats`（与后端对齐，含 `weakWordCandidates`）。
- `src/lib/api.ts`：新增 `getDailyReport(userId, date?)` → `POST /ai/report/daily`（body 缺省 `{userId}`、有 `date` 时 `{userId, date}`；默认带内存 token）。
- `src/app/page.tsx`：
  - `AiReportCard({ report, reportLoading, onRetry })`：吉祥物气泡 + `summaryText`（`AiReportSummary`）+ `weakWords` chip（`AiReportWeakWords`）+ `suggestionText`（`AiReportSuggestion`）+ 展开按钮（`AiReportToggle`）/详情（`AiReportDetails`，含 `date` + 默认提示）；
  - 拉取中 → 思考态占位（不显示生成按钮，避免成功路径闪现）；失败/无报告 → 思考态 +「生成今日小结」按钮（`AiReportGenerateBtn`）。
  - `HomeContent` 增 `report/reportLoading` 状态；`load()` 末尾独立 `try` 拉取（与 chat stars 同口径，失败不阻塞主数据）；`onRetry` 重新拉取。
  - 复用既有 `mapBackendMascotExpr` 把后端 `mascotExpr`（happy/encourage/thinking/cheer）映射为前端 `Mascot` 枚举。

## 2. 一致性（consistency）— PASSED
- 前端 `npx tsc --noEmit`：**0 错误**。
- `npm run typecheck:e2e`（e2e tsconfig）：**0 错误**。
- Vitest 全量：**64/64 通过**（含新增 `api.spec.ts` 3 case）。
- 全栈契约与 AI-502 `DailyReportResponse` 对齐（字段名/类型逐一核对）。

## 3. 测试（tests）— PASSED
### 单元测试（Vitest，`src/lib/api.spec.ts` 3 case）
- `getDailyReport`：POST `/api/ai/report/daily`、date 缺省时体为 `{userId}`、有 date 时含 `date`、响应映射为 `DailyReportResponse`。
- 400 响应 → 抛 `ApiError` 且 `status === 400`。
（`src/lib/api.ts` 属纯逻辑封装，按 feature-builder 前端单测铁律必测；UI 行为由 E2E 覆盖。）

### BDD/E2E（Cucumber + Playwright，`home-dashboard.feature` 新增 3 scenario）
1. **报告卡展示**：mock 报告端点返回 summary + weakWords → 断言卡片出现、summary 文案、weakWords chip 含两个词。
2. **展开详情**：点击「查看详情」→ 断言 `AiReportDetails` 含报告日期（YYYY-MM-DD）。
3. **失败→重试**：mock 端点持续 500（显式开关）→ 断言「生成今日小结」按钮出现；点击前翻转开关为成功 → 断言重试后 summary 渲染。
- 全栈套件回归：**35 scenario / 278 step 全绿**（确认未破坏现有 home 行为）。

## 4. 评审（review）— PASSED
- 0 open 项。
- 纯前端消费层，**不新增后端接口**、不改 AI-502 API 契约。
- 复用既有 `mapBackendMascotExpr` 映射后端表情（不重造映射，避免双口径漂移）。
- `reportLoading` 区分「未装载 / 失败」，避免成功路径瞬间闪现生成按钮（UX 正确性）。
- 报告拉取独立 `try`，失败仅 `logger.error` + 显示生成按钮，**不阻塞**课程/任务/计划/星星主数据。
- 无裸 `console`；`data-component` 钩子齐全（便于 E2E 定位）。

## 5. 优化（optimization）— PASSED
- 0 open 项。
- 报告拉取随主数据并行独立装载，**零阻塞**主渲染。
- 无 stub / 无临时降级分支残留。
- 不引入新依赖；弱项以 chip 展示，零额外请求。

## 6. 踩坑与复用铁律（已写入 MEMORY.md）
- **E2E「失败→重试」必须显式开关挂共享 page 对象**：初版用「首次 500 后续 200」，但 React StrictMode 在 dev 下双调用 effect，第 2 次调用已返回 200，生成按钮瞬间被成功卡覆盖，断言永远等不到按钮。改为显式 `failMode` 开关，挂在**各 step 共享的 `world.page`** 上（各 step `new HomePage` 引用同一 page 实例），点击 step 翻转为成功 → 兼容 StrictMode 且跨 step 生效。
- 复用了既有 E2E 通配 `**/api/ai/report/daily**`（避免 query 串精准匹配漏网，见 MEMORY E2E 铁律）。

## 7. 文档同步
- `features/ai-504.md`（设计文档）
- `docs/quality/ai-504-gate.md`（本报告）
- `backlog.md`：AI-504 `doing → done`
- 未改动其他文档（AI-502/503 已落地报告契约与提示，本 feature 仅前端消费）。
