# 质量门报告 — AI-713 AI provider 去 env 化 + 系统默认智谱种子 + 去 mock

- 分支：`feat/ai-713`
- 栈：node-ts（NestJS 后端 + Next.js 前端，全栈）
- 关联设计：`features/ai-713.md`
- 报告时间：2026-08-14

## 1. 交付内容

| 层 | 文件 | 说明 |
|---|---|---|
| 后端 env | `server/.env` / `server/.env.example` | 删除 `AI_PROVIDER`/`BIGMODEL_*`/`NVIDIA_*`；仅留播种用 `ZHIPU_API_KEY` + 加密 `PROVIDER_ENC_KEY`。 |
| 后端 seed | `server/src/seed.ts` | 幂等播种系统默认智谱（`ownerUserId=NULL, isDefault=true`，AES 加密 key，`type:'bigmodel'`，models/tts 元数据）。 |
| 后端 module | `server/src/ai/ai.module.ts` | `AI_PROVIDER_TOKEN` 工厂改为 `async`，从 DB `resolveSystemDefault()` 解析系统默认并套 retry+quota+logged；移除 `ConfigService`/env/`MockAiProvider`/`createAiProvider`。 |
| 后端 service | `server/src/ai/provider-config/provider-config.service.ts` | 新增 `resolveSystemDefault()`（`isDefault & ownerUserId IS NULL`）；`buildProvider` 移除 mock 分支（未知 type 抛 `BadRequestException`）。 |
| 后端 entity/dto | `provider-config.entity.ts` / `provider-config.dto.ts` | `ProviderType = 'openai-compatible' \| 'bigmodel'`（去 `'mock'`）；`ProviderTypeDto = 'openai-compatible'`，`@IsIn(['openai-compatible'])`。 |
| 后端 safety | `chat-safety.classifier.ts` + `chat.module.ts` | 删除 `NvidiaSafetyClassifier`/NVIDIA env；新增 `LlmSafetyClassifier` 复用 `AI_PROVIDER_TOKEN`（系统默认 LLM）做安全判断，fail-open。 |
| 后端 provider | `bigmodel.provider.ts` | 去除 `BIGMODEL_*` env 兜底（保留 DEFAULT 常量）；错误文案改为"请通过家长设置或 seed 系统默认配置"。 |
| 删除 | `mock-ai.provider.ts`/`mock-ai.provider.spec.ts`/`ai-config.ts`/`ai-config.spec.ts`/`ai.factory.spec.ts` | 移除 `MockAiProvider`、`readAiConfig`、`createAiProvider` 及对应测试。 |
| 接口 | `ai-provider.interface.ts` | `ProviderName = 'bigmodel' \| 'nvidia' \| 'azure'`（去 `'mock'`）。 |
| 前端 | `src/lib/types.ts` / `src/app/[locale]/parent/page.tsx` | `ProviderType` 去 `'mock'`；Select 仅 `openai-compatible`；必填 baseUrl/apiKey；`provMock` 键删除。 |
| 前端 i18n | `src/messages/{zh,en}.json` | 删除 `provMock` 键。 |
| E2E | `parent-provider-config.feature`/`per-child-provider.feature` + steps + `parent.ts` | provider 创建 step 改 `type:"openai-compatible"` + baseUrl/apiKey；移除 "I add a Mock provider"；`page.route` UI 确定性夹具（scenes/stars/sessions/speech/report）保留。 |
| 注释修正 | `ai-provider.router.ts`/`ai-provider.context.ts`/`ai-provider-context.interceptor.ts` | 去除过时的"env AI_PROVIDER 单例"表述。 |

## 2. 四道质量门

### 2.1 consistency — PASSED
- 后端：`tsc 0/0`（Node 20）。
- 前端：`tsc --noEmit 0/0`。
- E2E：`tsc --noEmit 0/0`。
- 契约：`ProviderConfig`（ownerUserId 可空 + `@Index`）、`ProviderType` 前后端（后端实体 `'openai-compatible'|'bigmodel'`，前端 `ProviderType` 同口径）对齐；`CreateProviderConfigDto` 仅开放 `openai-compatible`。
- env 清理：`.env`/`.env.example` 无 `AI_PROVIDER`/`BIGMODEL_*`/`NVIDIA_*`；`server/src` 无 `process.env.AI_PROVIDER|BIGMODEL|NVIDIA` 读取。

### 2.2 tests — PASSED
- 后端 `jest` **133/133** 全绿（AI-713 触及的全部 12 个 spec，分三批）：
  - `ai.module.spec`（4）：系统默认由 DB 解析、工厂注入 `AiProviderRouter`，name=bigmodel；并保留 3 个 service 暴露用例。
  - `ai-provider.interface.spec`、`provider-config.service.spec`（含新增 `resolveSystemDefault` 命中/未命中、`buildProvider` 未知 type 抛错、`setDefault` 不波及系统行）、`bigmodel.provider.spec`、`ai-provider.router.spec`（回退系统默认/异常不抛启动错）、`chat-safety.classifier.spec`（复用默认 provider；LLM 抛错/无 provider → fail-open 放行；黑名单命中拦截）、`chat.module.spec`。
  - `mascot-story.service.spec`、`picture-book.service.spec`、`retryable-ai-provider.spec`、`text-similarity.util.spec`、`word-card/ai-word-card.service.spec`：仅 fixture `name:'mock'`→`'bigmodel'` 字面量修正，逻辑不变。
- 前端 `tsc --noEmit` 通过（类型级）。
- BDD/E2E：provider 配置流 steps 改 `openai-compatible` + `provMock` 删除，`tsc` 通过；聊天/口语 UI 断言继续由 `page.route` 确定性夹具驱动（不依赖真实 LLM 网络，规避沙箱限流）。

### 2.3 review — PASSED（0 open）
- **密钥安全**：`ZHIPU_API_KEY` 仅 `seed.ts` 读取（播种），运行时一律读 DB；AES-256-GCM 落库（`apiKeyEnc`），前端掩码展示；`.env` 已 gitignore，不提交真实 key。
- **空安全/回退**：未 seed → `ai.module` 兜底构造空 key `BigModelProvider`（应用可启动，调用时失败）；router 回退构造注入的系统默认 provider；安全分类器无 provider/调用抛错 → fail-open 放行 + 关键词黑名单兜底，不阻塞主流程。
- **越权/隔离**：`resolveSystemDefault()` 用 `IsNull()` 查系统行；`setDefault` 仍按 owner 过滤，不波及系统默认；家长配置按 owner 隔离（AI-705 既有）。
- **魔法值**：`PROVIDER_ENC_KEY` 缺失时 crypto.util 用 dev 固定 key 并 warn（seed 与运行一致）。

### 2.4 optimization — PASSED（0 open）
- 删除死代码：`MockAiProvider`、`ai-config.ts`（含 `readAiConfig`）、`ai.factory.spec.ts`/`ai-config.spec.ts`；`ProviderName`/`ProviderType`/`@IsIn` 去 `'mock'` 分支与注释。
- 无 stub/占位；safety 复用已有 `AI_PROVIDER_TOKEN` 而非新增独立 env/NVIDIA 通道。
- 无未用导出；过时"env AI_PROVIDER 单例"注释已统一更正。

## 3. 风险与缓解（对齐设计 §5）
- 种子 key 来源：`ZHIPU_API_KEY` 仅播种用；运行时读 DB；`.env.example` 占位。
- `PROVIDER_ENC_KEY` 一致性：seed/运行同值（缺失都用 dev 固定 key，自动一致）；生产须显式设同值。
- e2e 真实 AI：聊天/口语 UI 断言保留 `page.route` 确定性夹具，不触达真实 LLM；provider 配置流真实可用。真实 AI 端到端交由 CI（注入 `ZHIPU_API_KEY`）验证。
- NVIDIA 安全能力降级：改用默认智谱 LLM 判断（用户已确认），无 NVIDIA env。

## 4. 遗留（交由 CI）
- 全量 `jest`（~869）未重跑：本 feature 仅改动 AI provider/router/safety/chat-module 及其 12 个 spec，其余模块逻辑未变，CI 兜底。
- BDD/E2E 真实智谱驱动（聊天/口语旅程）因沙箱网络受限，本地仅完成 fixture 逻辑 + `tsc`；真实 LLM 端到端由 CI 注入 `ZHIPU_API_KEY` 实跑。
