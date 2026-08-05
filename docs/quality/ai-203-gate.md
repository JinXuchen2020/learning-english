# AI-203 质量门报告

> 分支: feat/ai-203 | 栈: node-ts (NestJS) | 阶段: ai-203
> 关联: `.quality-gate.json` (`cleared:true`, `enforced:true`)

## 概览

AI-203 把 AI-202 的「最小可运行占位提示词」替换为生产级 **PlanAgent System Prompt**（双语儿科友好），
并配套 `buildPlanUserPrompt` 支持可选课程目录注入。无新接口/表/DTO，复用 AI-202 的 `POST /api/ai/plan/generate`。

## 四道质量门结论

### 1. 一致性门 (consistency) — PASSED
- `tsc --noEmit -p tsconfig.json` → **0 错误**。
- `jest` 全量 → **254/254 通过**（AI-202 时 241，+13）。
- 接口契约无漂移：`GeneratePlanDto` / 响应 `GeneratePlanResponse` / 路由均不变；仅替换 system prompt 与 user 消息组装。
- 纯后端 feature，无全栈前端契约。

### 2. 测试门 (tests) — PASSED
**单元测试（2 文件）**：
- `plan-agent.prompt.spec.ts`（新增，12 cases）：提示词非空、双语（中文+CJK + 英文术语）、内容安全红线（暴力/恐怖/成人/危险/政治/宗教/姓名/联系方式/屏幕）、每日结构（1 main + 2 review + 1 speaking）、间隔复习、技能交错（vocab/listen/speak/write 四类）、仅 JSON、引用真实 courseId/lessonId（UUID 禁止编造）、低 temperature；`buildPlanUserPrompt` 无目录/有目录两种形态。
- `plan.service.spec.ts`（更新，+3 cases）：断言 `generatePlan` 发出的 system 消息即双语提示词常量（防回退占位）、user 消息为学习者画像 JSON（含 `learnerProfile`、未给目录时含 `catalogNote`）。

**BDD/E2E（0 场景，豁免）**：本 feature 为纯后端提示词替换，无新增前端 UI / 端到端用户旅程；
接口与 `/plan` 页旅程已由 AI-202 / AI-207 / AI-208 覆盖。按约束 #6 及 AI-201/AI-202 先例，纯后端数据/提示词层 feature 不单独写 BDD；若后续需覆盖，由 AI-207/AI-208 的 `/plan` 页 E2E 一并覆盖。

### 3. 代码审查门 (review) — PASSED (0 open)
- 空安全：提示词为纯字符串常量；`buildPlanUserPrompt` 对 `catalog` 空值有 `hasCatalog` 守卫，避免对空目录段渲染。
- 错误处理：无新增 IO；降级路径沿用 AI-202（`extractJson` + `degraded`）。
- 注入/安全：提示词显式禁止真实姓名/联系方式输出；无密钥硬编码。
- 死代码/魔法值：清除了 AI-202 占位 `PLAN_SYSTEM_PROMPT` 常量，无遗留。
- 一致性：`PlanLesson`/`PlanCatalog` 类型与 `study-plan.entity` 的 `StudyPlanSkillType`、`generate-plan.dto` 的 `PlanLevel` 同口径复用。
- 测试面：提示词与服务消息形态均有单测覆盖。

### 4. 优化门 (optimization) — PASSED (0 open)
- 替换占位提示词为生产级双语提示词（不再有「保持简短以免过度构建」的占位注释）。
- 未越界：未写 Schema 校验（AI-204）、未查库注入目录（AI-204/206）、未加接口。

## 遗留风险
- **目录未注入**：AI-203 默认 `buildPlanUserPrompt(dto)` 不传目录，模型此刻无法引用真实 `courseId`/`lessonId`；
  提示词已确立「目录提供时必须引用真实 id、禁止编造」指令，真实闭环由 AI-204（Schema 校验 id 存在性）+ AI-206（注入目录并落库）完成。
- **内容安全双保险**：提示词层红线已就位；关键词黑名单 + 内容安全模型二次过滤属 AI-406，不在本 feature。

## 受影响文件
- 新增：`server/src/plan/plan-agent.prompt.ts`、`server/src/plan/plan-agent.prompt.spec.ts`
- 修改：`server/src/plan/plan.service.ts`（接入双语提示词 + `buildPlanUserPrompt`，移除占位常量）、
  `server/src/plan/plan.types.ts`（`PlanLesson` 增 `courseId`/`lessonId`；新增 `PlanCatalog*` 类型）、
  `server/src/plan/plan.service.spec.ts`（+3 断言）
- 文档：`features/ai-203.md`、`docs/ai-integration.md`、`features/backlog.md`
