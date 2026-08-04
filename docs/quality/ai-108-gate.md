# Quality Gate Report — AI-108 AI 调用日志

- **Phase**: ai-108
- **Stack**: node-ts (NestJS + TypeORM)
- **Branch**: `feat/ai-108`（基于 `feat/ai-107`，未 push）
- **Cleared**: true / Enforced: true（pre-commit hook 强执通过）

## 四道通用门

### 1. consistency（一致性）— PASSED
- `nest build` / `tsc --noEmit` 0 错误。
- `jest --coverage` 全量 **35 suites / 218 tests 全绿**。
- 覆盖率 **All files 98.58% stmts / 84.36% branches**（远高于 90/70 基线）。
- 纯后端 provider 增强，无前端 UI 旅程，无全栈契约漂移。

### 2. tests（测试）— PASSED
- 单元测试（新增 2 文件）：
  - `ai-call-log.service.spec.ts`：ok/error 记录、文本字段截断（errorMessage 256 / snippet 201）、DB 写失败 best-effort 返回 false + 告警。
  - `logged-ai-provider.spec.ts`：5 个方法均经审计层（logger.info + record 各 1 次）；成功/失败/配额拦截路径都落审计；response 仅成功记录；token 提取正确；截断生效；userId/moduleTag 解析器可注入。
- `ai.module.spec.ts` 适配：新增 `AiCallLog` 仓库 override 链路（TypeOrmModule.forFeature([AiUsage, AiCallLog])）。
- **BDD/E2E 0（legacy 豁免）**：纯后端/无头 provider 增强，无前端 UI 旅程，按硬约束 #6 豁免（设计文档 §6 已载明）。

### 3. review（评审）— PASSED
- 审计写库 **best-effort**：`record` 内 try/catch 吞异常返回 false；调用方 `.catch(() => undefined)` 双重保险——绝不以审计拖垮用户 AI 调用。
- **文本字段二次截断兜底**：service 与 provider 两层截断一致（errorMessage ≤255+…、snippet ≤200+…），直接调用 `record` 也不会写出超长内容；`errorMessage` 列已由 VARCHAR(255) 改为 TEXT 容纳 256 字符。
- **敏感内容不落库**：请求/响应只记截断摘要；多模态仅记 `[image:<mime>]`；音频记 `audio[<mime>]`，绝不写儿童原始录音 base64 / 长文本。
- **错误原样透传**：`runLogged` 在 finally 中记 error 审计后 `throw err`，审计不吞业务异常。
- **单次记录不重复**：审计层位于 provider 链最外层（`Logged(UsageLimited(Retryable(inner)))`），一次用户请求 = 一条审计（含 AI-106 重试总耗时），retry 内部不重复记。
- 配置走 `ConfigService` + DI token 解析器，无硬编码。

### 4. optimization（优化）— PASSED
- 无 stub / 占位实现；所有分支有真实逻辑与测试覆盖。
- provider 链清晰分层：`Logged(UsageLimited(Retryable(inner)))`，每层单一职责。
- `USER_ID_RESOLVER_TOKEN` / `AI_MODULE_TAG_RESOLVER_TOKEN` 扩展点预留，待 AI 控制器接入后按登录用户 + 业务模块隔离（当前默认 `anonymous` / `global`）。
- `logger.info('[AI-CALL]', {...})` 结构化审计，便于即时 grep 与成本聚合。
- 无敏感信息泄漏（见 review）。

## 偏离 / 风险
- 当前无 AI 控制器 → 默认 `anonymous` / `global` 桶；未来 AI-20x/30x/40x 需注入请求级 userId/moduleTag 解析器实现按登录用户与模块隔离。
- `ai_call_logs` 为 append-only 流水，长期增长需后续加 TTL / 归档（不在本 feature 范围）。

## 关联
- 依赖：AI-106（重试层，日志位于其外层）、LOG-101（结构化 logger）。
- 文档同步：`docs/ai-integration.md` 成本/速率段补充审计日志说明、M1 路线补充 AI-108；`features/backlog.md` 标 done。
