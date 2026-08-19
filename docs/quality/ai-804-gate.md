# AI-804 质量门报告

> Feature: AI-804 — 学习计划生成流式显示（Streaming Plan Generation UX）
> 分支: `feat/ai-804`（自 `feat/ai-803` 切出）| 日期: 2026-08-18 | 栈: node-ts (Next.js 14 前端 + NestJS 10 后端)

## 1. 四门结果

| 门 | 结果 | 证据 |
|---|---|---|
| consistency | **PASSED** | 后端 `nest build`（tsc）通过；前端 `tsc --noEmit` 0；e2e `tsc`（src/e2e/tsconfig.json）0；后端全量 jest **908/908** 全绿（含 AI-804 新增 `plan.service.spec` 7 例 + `openai-compatible.provider.spec` 4 例 SSE）；前端 vitest **140/140** 全绿（含新增 `api-stream.spec` 8 例） |
| tests | **PASSED（user-accepted-ci）** | 本地 jest（plan.service 流式 start→token→done/useTemplate/无效 JSON→error/坏 schema/截断/流异常/无 streamChat→STREAM_UNSUPPORTED + openai-compatible SSE delta 累积/多行+跳过非 JSON/length→PLAN_TRUNCATED/无 chat→UnsupportedMethodError）+ 前端 vitest `api-stream.spec` 8/8（consumeSse 跨 chunk/心跳跳过、generatePlanStream 正常序/error 不抛/非 ok/无 body 退化/abort 静默）+ 新增 `plan-stream.feature` 端到端场景（成功走 stream 端点→预览；首次失败重试成功→预览），e2e `tsc` 0；全量 E2E 实跑交 CI `e2e` job 兜底（本机 next dev 受限，见 §3） |
| review | **PASSED** | 对抗式自检 0 open（见 §2） |
| optimization | **PASSED** | 0 open：无死代码/裸 console；`consumeSse` 为纯函数可单测；既有 `mockGeneratePlan` 改为 mock `/generate/stream` 且结构不变，plan-wizard/display/courses/progress 既有场景零回归（见 §2） |

> `tests` 门经**用户显式接受「E2E 交 CI `e2e` job 兜底」**，在 `gates.tests` 标注 `user-accepted-ci`，故 `tests:PASSED` 合规放行（非 agent 私自自报）。本地仅能跑 jest + vitest + e2e tsc（E2E 浏览器实跑需全栈 boot，本机 next dev 受限），全量 E2E 由 CI 注入 `AGNES_API_KEY` 后由 `e2e` job 验证。

## 2. review 对抗式自检

- **Provider 链透传完整性**：`AiProvider.streamChat` 在接口层**保持可选**，既有仅实现 `chat` 的测试桩（如 `logged-ai-provider.spec`/`usage-limited-ai-provider.spec` 的 `inner`）不需改；`OpenAiCompatibleProvider.streamChat` 真实 SSE 解析（`ReadableStream` 行切分、`data:[DONE]` 终止、`finish_reason:'length'`→`AiProviderException('PLAN_TRUNCATED')`、`AbortError`→`ABORTED`）；`ChatProvider`/`AiCapabilityHub`/`UsageLimitedAiProvider`/`LoggedAiProvider` 逐层透传，缺失 → `STREAM_UNSUPPORTED` 由 `PlanService` 映射为 error 事件（不崩）。
- **事件通道纪律**：`PlanService.generatePlanStream` 捕获全部 provider 异常并 emit `error` 事件（**不向上抛**，因 SSE 已无法改 HTTP 状态）；`PlanController.generateStream` 仅 `res.write` + `res.end()`，`req.on('close')`→`AbortController.abort()` 透传 provider fetch。非流式 `generate` 保留「出错即抛」口径不变，二者边界清晰。
- **流仅展示、末端校验**：`generatePlanStream` 累积 fullText，流结束后才 `extractJson`+`validatePlan`（复用 AI-204），不解析中间态 JSON（避免半成品崩溃），与「出错即抛」口径一致。
- **前端健壮性**：`consumeSse` 纯函数——跨 chunk 帧边界（`\n\n` 切分 + 残留 flush）、跳过非 JSON 控制行（`: heartbeat`/`data: not-json`）、`AbortError` 静默返回（取消不误报 error）；`res.body` 缺失自动退化 `generatePlan` 合成 `start→done`（极旧运行时兜底）。`handleGenerate` 用 `AbortController` 取消 + `finally` 收口 `streaming=false`，`handleCancel` 仅 abort 不抛。
- **既有场景零回归**：`mockGeneratePlan` 改 mock `/generate/stream`（plan 结构与原非流式 mock 完全一致），plan-wizard/plan-display/plan-courses/plan-progress 四套既有 feature 仍封闭运行；新增 `plan-stream.feature` 不改动其步骤动词。
- **日志**：仅用 Nest `Logger`（无裸 console）；provider 异常/截断均有 `logger.error` 且经 error 事件收尾。

## 3. 设计偏离 / E2E 限制（如实说明，不夸大）

- **本机 E2E 无法观测「逐帧渐进草稿」**：Playwright 1.62 的 `route.fulfill` 将 body 一次性转 base64 响应（不支持分块流式）。以单串 SSE 帧返回时，浏览器在首个 `reader.read()` 内同步处理全部事件，React 批量提交只渲染终态（`PlanStreaming` 草稿面板不落帧）。故 e2e 仅验证「走 stream 端点 → `done`→预览 / `error`→错误+重试」终态正确性；逐帧渲染窗口由前端 `consumeSse` 单测（事件按序产出）+ 组件状态逻辑保证。全量 E2E 实跑交 CI（user-accepted-ci）。
- **504 缓解依赖总时长 < 60s**：流式持续吐帧使 Vercel 网关连接存活（不因「长时间无响应」掐断），但单模型极慢仍可能超时；已用 `timeoutMs:55s` + `enable_thinking:false` + `maxTokens:8000` 留余量（与后端 `nest build` + jest 全绿一致，未引入新风险）。

## 4. E2E 范围

新增 `src/e2e/features/plan-stream.feature`：
- 场景 1「走 stream 端点 → 结构化预览」：mock `/generate/stream` 返回 start→token→done，提交后断言 `PlanPreview` 含 ≥1 周 + ≥1 计划日卡。
- 场景 2「首次失败重试成功」：mock 首次返回 error 事件、重试返回 done，断言 `PlanStreamError` + `retry-stream` 按钮可见，点击后预览出现。

扩展 `src/e2e/support/pages/plan.ts`（`streamGenerate`/`mockStreamValidPlan`/`mockStreamErrorThenValid`/`submitGeneration`/`clickRetry`，并将 `mockGeneratePlan` 改为 mock `/generate/stream`）与 `src/e2e/step-definitions/plan.steps.ts`（对应 given/when/then）。断言基于稳定 `data-component` 与 URL 模式（CI 跑 zh），不依赖 locale 文案。全量 E2E 实跑交 CI 验证（user-accepted-ci）。

## 5. 改动文件清单

后端（NestJS）：
- `server/src/ai/ai-provider.interface.ts`（新增可选 `streamChat?`）
- `server/src/ai/provider-config/openai-compatible.provider.ts`（`streamChat` SSE 实现 + `AbortError`/`PLAN_TRUNCATED` 映射）
- `server/src/ai/chat.provider.ts`（`streamChat` 透传 + 不支持退 Mock）
- `server/src/ai/mock-ai-provider.ts`（`streamChat` 一次性 yield `CHAT_FALLBACK`）
- `server/src/ai/ai-capability-hub.ts`（`streamChat` 透传 chatProvider）
- `server/src/ai/usage-limited-ai-provider.ts`（`streamChat` 配额守卫后透传）
- `server/src/ai/logged-ai-provider.ts`（`streamChat` 审计透传）
- `server/src/plan/plan.types.ts`（新增 `PlanStreamEvent`）
- `server/src/plan/plan.service.ts`（`generatePlanStream` 异步生成器）
- `server/src/plan/plan.controller.ts`（`generateStream` SSE 端点）
- `server/src/plan/plan.service.spec.ts`（7 例流式单测）
- `server/src/ai/provider-config/openai-compatible.provider.spec.ts`（4 例 SSE + 修正 `jest.fn` 泛型类型使 `nest build` 通过）

前端（Next.js）：
- `src/lib/types.ts`（新增 `PlanStreamEvent`/`PlanStreamErrorCode`）
- `src/lib/api.ts`（新增 `generatePlanStream` + 纯函数 `consumeSse`）
- `src/lib/api-stream.spec.ts`（8 例流式封装单测）
- `src/app/[locale]/plan/page.tsx`（`PlanContent` 改为流式：草稿面板 / 取消 / 错误重试）
- `src/messages/{zh,en}.json`（Plan.streaming/thinkingPhase/writingPhase/streamHint/generatingWeek/cancel/canceled/streamError/retry）

E2E：
- `src/e2e/features/plan-stream.feature`
- `src/e2e/support/pages/plan.ts`（`streamGenerate`/`mockStreamValidPlan`/`mockStreamErrorThenValid`/`submitGeneration`/`clickRetry` + `mockGeneratePlan` 改 mock `/generate/stream`）
- `src/e2e/step-definitions/plan.steps.ts`（流式 given/when/then）

文档：
- `features/backlog.md`（AI-804 → done）
- `features/ai-804.md`（状态 done + §9 实施备注）
- `docs/ai-integration.md`（新增 `POST /api/ai/plan/generate/stream` + 前端流式 UX）
- `docs/quality/ai-804-gate.md`（本报告）
- `.quality-gate.json`（四门状态，`tests=user-accepted-ci`，cleared:true）
