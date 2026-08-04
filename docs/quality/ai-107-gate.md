# AI-107 质量门报告 — 每日 token / 调用配额

> 分支: `feat/ai-107`（基于 `feat/ai-106`）| 栈: `node-ts` (NestJS 10 + TypeORM)
> 生成: feature-builder Phase 4 | 报告引用: `.quality-gate.json`

## 门禁总览

| 门 | 结论 | 证据 |
|---|---|---|
| consistency | ✅ PASSED | `nest build`/`tsc --noEmit` 通过；`jest` 199/199 全绿；纯后端 feature，无全栈契约需对齐 |
| tests | ✅ PASSED | 单元测试 3 个文件全绿；BDD/E2E 0（约束 #6 豁免：纯后端/无头 provider 增强，无前端 UI 旅程） |
| review | ✅ PASSED | 0 open |
| optimization | ✅ PASSED | 0 open |

## 一致性（consistency）

- `npx nest build` 退出码 0（含 `tsc` 严格类型检查）。
- `npx jest --coverage`：33 suites / 199 tests 全绿。
- 覆盖率：`All files 99.19% stmts / 85.97% branches / 95.8% funcs / 99.33% lines`，高于项目基线（90/70）。
- 纯后端能力增强，无前端/全栈契约变更，契约对齐项 N/A。

## 测试（tests）

单元测试文件（均落 `server/src/ai/`）：

1. **`ai-quota.spec.ts`** — `readAiQuotaConfig`（缺省/空/非法回退默认、显式覆盖）、`computeQuotaState`（剩余量计算、达上限 `limited`、Math.max 下界）。
2. **`ai-usage-limit.service.spec.ts`** — `getState`（无行=0/有行）、`assertWithinQuota`（通过/调用数超限抛 429/ token 超限抛 429/恰好相等不拦截）、`recordUsage`（首建行/累加/跨日开新行/token 累计）。
3. **`usage-limited-ai-provider.spec.ts`** — chat 正常（assert+inner+record，token 透传）、chat 超限（inner 不调用、不记账）、chat inner 抛错（不记账、错误透传）、chatWithImage/transcribe/assess/synthesize（计 0 token）、`name` 透传、自定义 resolver。

配套回归：`ai.module.spec.ts` 已扩展仓库覆盖以适配 `AiUsageLimitService` 注入；`ai.factory.spec.ts` 因保留 `createAiProvider(config)` 原签名保持通过。

BDD/E2E：按约束 #6 豁免（无前端 UI 旅程）。配额触发可由 `AI_DAILY_CALL_LIMIT` 调小后在单测/未来控制器层面验证。

## 代码审查（review，对抗式 checklist）

- **空安全**：`getState` 用 `row?.callCount ?? 0`；`extractTokens` 用 `result?.usage?.totalTokens ?? 0`；`readAiQuotaConfig` 对非法 env 回退默认。无崩溃路径。
- **错误处理**：`assertWithinQuota` 超限抛 `AiQuotaExceededError`；`UsageLimitedAiProvider` 不吞异常（`runQuotaGuarded` 在 `fn()` 抛错时跳过 `recordUsage` 并透传）。
- **注入/安全**：配额配置经 `ConfigService`，无硬编码密钥；`userId` 仅在日志中以明文出现（非敏感）。
- **边界**：配额恰好相等用严格 `>` 判定不误拦；`callsRemaining`/`tokensRemaining` 用 `Math.max(0, …)` 下界；跨日自动开新行；并发弱一致（read-modify-write，低流量可接受，已在设计文档标注）。
- **死代码/魔法值**：`DEFAULT_DAILY_CALL_LIMIT`/`DEFAULT_DAILY_TOKEN_LIMIT` 提取为常量。
- **类型契约**：`UsageLimitedAiProvider.name` 透传内层 `ProviderName`；`UserIdResolver` 类型化扩展点。
- **日志/可观测**：`logger.debug` 记账（userId/date/counts），`logger.warn` 启动缺 key；无敏感内容。
- **测试面**：全部有逻辑分支的源码均有对应单测。

## 优化（optimization）

- 无 stub/占位代码；`UsageLimitedAiProvider` 编排清晰。
- 错误分类明确：`AiQuotaExceededError` 位于最外层，不会进入 AI-106 `withRetry`（重试只针对瞬时网络错误），避免对配额上限无意义重试——这是有意的架构决策，非遗漏。
- 失败/重试不计费，避免瞬时错误虚增配额（与 AI-106 重试共存的有意设计）。

## 遗留风险

- **用户上下文**：当前无 AI 控制器，`USER_ID_RESOLVER_TOKEN` 默认返回 `'anonymous'`（所有调用计入匿名桶）。未来 AI 控制器（AI-20x/30x/40x）落地时需注入请求级 `UserIdResolver` 以真正按登录用户隔离配额——扩展点已预留。
- **并发竞争**：`recordUsage` 为 read-modify-write 非事务，极端并发可能短暂超量；后续可改 `repo.increment`/行锁。
