# AI-502 质量门报告

> 阶段：M5「AI 错题与进度报告」· 质量门 Phase 4 产出
> 提交：feat/ai-502（基于 feat/ai-501）· 未 push
> 质量门格式：扁平四键（consistency / tests / review / optimization 均为 `PASSED ...` 字符串），满足 pre-commit hook 强执约定

## 交付内容

| 文件 | 作用 |
|---|---|
| `server/src/ai/ai-report.service.ts` | `AiReportService`：聚合当日四类统计 → 调 `AiProvider.chat(ReportAgent)` → 解析落库；无活动/AI失败降级；幂等 |
| `server/src/ai/ai-report.controller.ts` | `POST /api/ai/report/daily`（不加 guard，与 `ai/speech` 一致），注入 `userId`+可选 `date` |
| `server/src/ai/report-agent.ts` | `REPORT_AGENT_SYSTEM_PROMPT` 默认提示 + `ReportAgentOutput` 契约 + `parseReportAgentOutput` 鲁棒 JSON 解析（去 code fence、截取首 `{`…尾 `}`）；`DEFAULT_SUMMARY`/`DEFAULT_SUGGESTION` 默认文案（AI-503 精炼接缝） |
| `server/src/ai/generate-daily-report.dto.ts` | `GenerateDailyReportDto`：`userId` 必填、`date` 可选 `YYYY-MM-DD` |
| `server/src/ai/ai-report.entity.ts` | `AiReport` 追加 `isDefault` 列（feat/ai-502 基于 feat/ai-501 lineage），保证幂等读回鼓励态不丢 |
| `server/src/ai/ai.module.ts` | 注册 controller + service + `forFeature(TaskCompletion, WordProgress, LessonProgress)` + providers |

## 四道质量门

| 门 | 结果 | 关键证据 |
|---|---|---|
| consistency | **PASSED** | `nest build` 0 错误；`jest` **288/288** 全绿；`npm run seed` 建 `ai_reports`(含 `isDefault`) 无报错；HTTP 冒烟 `POST /api/ai/report/daily` 返回 201 |
| tests | **PASSED** | 单元测试 16 case（service 8 + controller 2 + entity 6）；BDD/E2E 0（纯后端聚合接口豁免，已在 `features/ai-502.md` 标注） |
| review | **PASSED** | 0 open；空安全；幂等双保险（唯一约束 + findOne 优先读回 + isDefault 持久化）；AI 失败降级不缓存；唯一约束 race 兜底不 500 |
| optimization | **PASSED** | 0 open；无 stub；4 类聚合并行 `Promise.all`；ReportAgent 提示留 AI-503 精炼接缝 |

## 验收对照（来自 backlog / features/ai-502.md）

- [x] 无学习数据时返回友好默认报告（`isDefault:true`，持久化，同日幂等复用，省去无意义 AI 调用）
- [x] 有数据时含真实统计（聚合 `taskComplete` / `wordsPracticed` / `lessonsCompleted` / `speechAttempts` / `avgSpeechScore` 喂给 ReportAgent）
- [x] 同日重复生成返回已有报告（findOne 优先 + 唯一约束兜底）
- [x] AI 调用失败降级为友好默认且不持久化（下次可重试）
- [x] HTTP 契约：POST 注入 userId/date，ValidationPipe 校验缺失 userId → 400

## 冒烟测试记录

```
# 全新用户（无活动）
POST /api/ai/report/daily {"userId":"smoke-fresh-1"} → 201
  { id, isDefault:true, mascotExpr:"encourage", stats:{taskComplete:0,...} }
# 同用户同日再请求（幂等读回）
POST /api/ai/report/daily {"userId":"smoke-fresh-1"} → 201
  { id(同), isDefault:true }   # 同一行，鼓励态保留，未新建/未调 AI
# 缺 userId
POST /api/ai/report/daily {} → 400 { message:["userId should not be empty",...] }
```

## 偏离设计之处

- 相比 `features/ai-502.md` §2 草案：给 `AiReport` 实体追加了 `isDefault` 持久化列（AI-501 同 lineage）。原因：幂等读回路径若仅用「本次调用是否新建」判断 `isDefault`，会把已存的默认报告误报为真实报告、丢失前端 encourage 态。已在 Phase 2 冒烟中发现并修复。
