# AI-104 质量报告 — MockProvider 扩展夹具

- **分支**: `feat/ai-104`（基于 `master`，未 push）
- **栈**: node-ts (NestJS 10)
- **质量门强执**: `scripts/git-hooks/pre-commit` 已就位（`core.hooksPath` 指向它），commit 前校验 `.quality-gate.json` 的 `cleared:true` + 四道门 `PASSED`。

## 1. consistency（一致性门）— PASSED
- `tsc --noEmit -p tsconfig.json`：**0 错误**。
- `jest` 全量：**26 suites / 129 tests 全绿**，无回归（相较 AI-103 的 126 tests +3 个新用例）。
- 全栈契约：本 feature 仅扩展 `MockAiProvider` 返回内容，**不改 `AiProvider` 接口签名/字段**，无 DTO/类型契约变更。

## 2. tests（测试门）— PASSED
- **单元测试**：`server/src/ai/mock-ai.provider.spec.ts` —— **1 文件 / 10 用例全绿**。
  - 覆盖 `chat` 三分支：计划意图（中/英、大小写容错）→ `[Mock 计划]` 文本；报告意图 → `[Mock 今日小结]` 文本；通用 → `[Mock]` 回复；空消息 → 不崩溃。
  - 覆盖 `transcribe` 示例句 + `confidence=1`；`assessPronunciation` score=88 + weakPhonemes=['θ','v'] + mascotExpr='encourage'；`chatWithImage`/`synthesize` 回归。
  - 文件覆盖率：**语句/分支/函数/行 100%**（jest `--coverage` 实测）。
- **BDD/E2E**：**0 场景** —— `MockAiProvider` 是 headless 后端 provider，无独立端点/UI，按硬约束 #6「不为纯后端 API 写 BDD」**显式豁免**；其端到端行为由消费方 feature 自带 BDD/E2E：
  - 计划演示 → AI-207/AI-208（`/plan`）
  - 口语演示 → AI-307（`/speech`）
  - 报告演示 → AI-504（Home 今日小结卡）
  - 聊天演示 → AI-407（`/chat`）

## 3. review（代码审查门）— PASSED（0 open）
逐条自查（附录 B）：
- 空安全：空消息列表安全回退（不崩溃，`lastUser` 可能 undefined 已处理）。
- 错误处理：无外部 IO，无吞异常风险；意图识别纯函数，不可能抛网络异常。
- 注入/安全：无用户输入拼接到执行逻辑；无密钥硬编码。
- 边界：意图未命中统一走「通用」兜底；关键词匹配为子集包含，大小写归一。
- 死代码/魔法值：`PLAN_KEYWORDS`/`REPORT_KEYWORDS`/三类夹具文本提取为模块级私有常量，无散落字符串。
- 类型契约：`ChatResult`/`ScoreResult`/`TranscriptResult` 字段类型严格匹配接口；无 `any`。
- 日志/可观测：provider 无副作用日志需求（mock 不应污染日志）；无敏感信息。
- 一致性：命名/分层与 AI-103 建立的 `MockAiProvider` 基线一致，沿用 `ProviderName='mock'`。

## 4. optimization（优化门）— PASSED（0 open）
- 无 stub 残留：`assessPronunciation` 返回真实感假评分（非占位满分）；`transcribe` 返回可读句。
- 无临时调试代码；意图关键词为私有常量集合，可读可维护。
- 无未用导出；`name` 仍为 `'mock'`，与 `ai.factory`/消费方 `@Inject(AI_PROVIDER_TOKEN)` 契约一致。

## 5. 实现摘要
- 改动文件：`server/src/ai/mock-ai.provider.ts`（扩展夹具 + 意图识别私有方法）、`server/src/ai/mock-ai.provider.spec.ts`（10 用例）。
- 不越界：不改 `AiProvider` 接口、不新建类（沿用 AI-103 基线的 `MockAiProvider`）、不引入新依赖、不接重试/降级（AI-106）、不碰 `.env.example`（AI-105）。
- 与未来 schema 边界：`chat` 仅返回**可读演示文本**，不伪造 AI-203/AI-204 未定稿的 plan JSON Schema，避免误导消费方。
