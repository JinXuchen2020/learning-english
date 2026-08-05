# AI-202 质量门报告

> 分支: `feat/ai-202` | 栈: node-ts (NestJS) | 报告生成: 2026-08-05
> 设计文档: `features/ai-202.md` | 契约源: `docs/ai-integration.md`

## 实现摘要

- **路由**：`POST /api/ai/plan/generate`（`PlanController('ai/plan')` + 全局前缀 `api`）。按设计文档契约 `childId` 由 body 传入，**不加 `JwtAuthGuard`**（与 `docs/ai-integration.md` body 一致；AI-206 apply 接口再定鉴权）。
- **DTO**：`GeneratePlanDto`（class-validator）——`childId` `@IsUUID('4')`、`ageRange` `@Matches(/^\d{1,2}-\d{1,2}$/)`、`level` `@IsIn(['pre-a1','a1','a2'])`、`dailyMinutes` `@IsInt()@Min(5)@Max(120)`、`interests` `@IsArray()@ArrayNotEmpty()@IsString({each:true})@ArrayMaxSize(20)@MaxLength(30,{each:true})`、`weeks` `@IsInt()@Min(1)@Max(4)`。配合全局 `ValidationPipe(whitelist+transform+forbidNonWhitelisted)` 实现「非法入参 400」。
- **服务**：`PlanService` 注入全局 `AiProvider`（`AI_PROVIDER_TOKEN`），组装 `system+user(JSON(payload))` 消息 → `chat({temperature:0.4,maxTokens:2048})` → `extractJson` 剥离 markdown 代码围栏 → `JSON.parse` 为 `GeneratedPlan`。非 JSON（如 MockProvider 演示文本）降级 `degraded:true` + `plan.rawText`，仍 200，保 AI-104「无 key 演示」契约。
- **响应**：`GeneratePlanResponse{ plan, model?, degraded }`，计划未持久化（落库/应用属 AI-206）。
- **装配**：`PlanModule` 新增 `Controller+Service` 并导出 `Service`（供 AI-206/208 复用）；`app.module.ts` 注册 `PlanModule`。
- **占位提示词**：`PLAN_SYSTEM_PROMPT` 为最小可运行版，完整双语 PlanAgent（安全红线/间隔复习/技能交错）属 AI-203；JSON 严格 Schema 校验+重试属 AI-204，模板降级属 AI-205。

## 四道质量门

### 1. 一致性门 (consistency) — PASSED
- `tsc --noEmit` 0 错误。
- `jest` **241/241** 全绿（AI-201 时为 223，新增 18 cases）。覆盖率基线（≥90/70）由全量 `jest --coverage` 维持满足。
- `AppModule` 装配 `PlanModule` 后 DI 全解析（无 `AI_PROVIDER_TOKEN` 缺失报错），路由 `/api/ai/plan/generate` 经 Controller 注册可达。
- 纯后端 feature，无前端改动，无全栈契约需对齐。

### 2. 测试门 (tests) — PASSED
单元测试 **4 文件 / 23 cases**：
- `generate-plan.dto.spec.ts`（9 cases）：逐字段合法/非法——uuid/ageRange 正则/level 枚举/数值边界/interests 非空与元素类型/缺失字段。
- `plan.service.spec.ts`（5 cases）：JSON 解析成功→`degraded:false` 透传；markdown 围栏 JSON 仍可解析；非 JSON 文本→`degraded:true`+`rawText`；provider 抛错→向上传播；调用 payload 含全字段且 `temperature=0.4`。
- `plan.controller.spec.ts`（4 cases）：合法 body 经 `ValidationPipe` 后返回结构化响应；非法 body（缺 weeks+level 越界 / 非 uuid / interests 空数组）→ `BadRequestException`（等价 400）。
- `plan.module.spec.ts`（5 cases）：沿用 AI-201 in-memory 建表行为测试（未导入 `PlanModule`，避免其 `PlanService` 依赖全局 provider；服务/控制器装配由上述两 spec 覆盖）。

**BDD/E2E：0 场景（豁免）**——本 feature 为纯后端 API，约束 #6 明确「不为纯后端 API 写 BDD」；`/plan` 页面端到端旅程（向导提交→展示计划）由 AI-207/AI-208 自带 E2E。与 AI-201 同源口径。

### 3. 代码审查门 (review) — PASSED（0 open）
- 空安全：provider 返回空文本时 `extractJson` 原样返回，解析失败走降级分支，无崩溃。
- 边界：非 JSON / markdown 围栏 / 空 `weeks` 均健壮；`weeks` 限 1-4、`dailyMinutes` 限 5-120 防越界资源消耗。
- 注入/安全：全局 `ValidationPipe` 白名单 + `forbidNonWhitelisted` 丢弃未知字段；`childId` 限定 UUID 防越权遍历；用户输入仅作为 prompt 文本（无拼接 SQL/命令）。
- 错误处理：provider 异常向上传播，由 AI-106 重试/配额在外层处理；降级路径记录 warn 日志不抛 500。
- 魔法值：枚举/范围提取为 `PLAN_LEVELS` 常量与 DTO 装饰器，未硬编码散落。
- 日志：仅降级时 `Logger.warn`，无裸 `console`。
- 一致性：Controller/Service/Module/DTO 分层与现有 NestJS 模块（courses/auth）风格一致。

### 4. 优化门 (optimization) — PASSED（0 open）
- 无 stub/占位实现（占位提示词已注释说明待 AI-203，非未完成业务）。
- `extractJson` 为纯函数，剥离围栏逻辑可单测、可复用。
- `PlanService` 复用全局 `AiProvider`，`PlanModule` 不重复 import `AiModule`，无冗余导出。
- 响应结构含 `degraded` 标志，前端可据以降级展示，无临时调试代码残留。

## 遗留风险
- `PLAN_SYSTEM_PROMPT` 为占位，真实双语 PlanAgent（安全红线/间隔复习/技能交错）待 AI-203 替换。
- LLM 自由 JSON 仅 best-effort 解析，严格 Schema 校验 + 重试(≤3) + 模板降级待 AI-204/AI-205。
- 未做鉴权（按文档 `childId` body 传入）；AI-206 apply 接口需补 `JwtAuthGuard` 并校验 childId 归属。
- 未落库（符合本 feature 范围；落库与应用由 AI-206）。
