# M1 — AI 基建 (W1)

> 本里程碑共 **8** 个 feature，均已 `done`。


| ID | Feature | 优先级 | 依赖 |
|---|---|---|---|
| AI-101 | AiProvider 接口定义 | P0 | — |
| AI-102 | BigModel provider 实现 | P0 | AI-101 |
| AI-103 | AiModule 动态装配 | P0 | AI-102 |
| AI-104 | MockProvider | P0 | AI-101 |
| AI-105 | 配置与密钥管理 | P0 | AI-103 |
| AI-106 | 重试与降级 | P0 | AI-103 |
| AI-107 | 每日 token/调用配额 | P1 | AI-106 |
| AI-108 | AI 调用日志 | P1 | AI-106, LOG-101 |

---

## AI-101 — AiProvider 接口定义

> 优先级 **P0** · 依赖 — · 状态 done

**目标**

定义 `AiProvider` 抽象接口，统一 LLM / STT / TTS / 发音评测四类能力，使后续 BigModel / NVIDIA / Mock / Azure 等 provider 实现可插拔替换，业务模块只依赖接口。这是 M1 基建的第一块，AI-102 ~ AI-108、M2~M6 全部依赖它。

**验收标准**

- [ ] `server` 在 `tsc --noEmit`（strict: noImplicitAny / strictNullChecks）下零错误
- [ ] 接口与所有导出类型均有 JSDoc 注释（方法级 + 关键类型级）
- [ ] 类型覆盖 LLM（chat/chatWithImage）、STT（transcribe）、TTS（synthesize）、发音评测（assessPronunciation）四类能力
- [ ] 不引入任何具体 provider 依赖（仅类型与抽象），AI-102 再实现 BigModel

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**6. 质量门嵌入（feature-builder Phase 5 参考）**

> 本 feature 为纯类型定义，无业务逻辑分支，DDD 三层审查要点：
> - P0: 接口方法覆盖四类能力、类型非空安全、JSDoc 完整
> - P1: ProviderName 枚举与 `.env` 的 `AI_PROVIDER` 取值一致
> - P2: 预留 `chatWithImage` 供 AI-606 OCR 复用
> - P3: 无


---

## AI-102 — BigModel provider 实现

> 优先级 **P0** · 依赖 AI-101 · 状态 done

**目标**

实现 `AiProvider` 接口的第一个真实后端 **BigModelProvider**，对接智谱 BigModel 的 OpenAI 兼容端点，让业务层（plan / speech / chat / report）在 `AI_PROVIDER=bigmodel` 时获得可用的 LLM 对话与多模态能力。`chat` / `chatWithImage` 走真实 API；`transcribe` / `assessPronunciation` / `synthesize` 在 AI-102 范围内暂无 BigModel 对应能力，返回**降级结果**（不抛错，日志标记），待后续 feature（AI-304/AI-305/AI-402）接入真实 STT/TTS。

**验收标准**

- [ ] `tsc --noEmit`（strictNullChecks / noImplicitAny）零错误
- [ ] `chat` 在真实 key 下跑通一次并返回 `content`（推理模型 `reasoning_content` 被忽略）
- [ ] `chatWithImage` 以 base64 `image_url` 调用视觉模型并返回文本
- [ ] 无效 key（401）/ 限流（429）返回**清晰错误**（`AiProviderException`，`statusCode` 明确）
- [ ] 超时（60s）/ 网络断开 → 清晰异常，不挂死
- [ ] `transcribe` / `assessPronunciation` / `synthesize` 返回降级结果且不抛错
- [ ] 单元测试覆盖全部逻辑分支，`jest` 全绿
- [ ] 不引入新生产依赖；仅用 `globalThis.fetch`

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（覆盖有逻辑分支的源码）**

文件: `server/src/ai/bigmodel.provider.spec.ts`，注入 mock `fetch`：

- `chat`：成功（content / reasoning_content / usage / model 回填）；缺 `content` 抛 502；`temperature`/`maxTokens` 透传
- `chat` 错误路径：缺 key→401；401/403→鉴权失败；429→限流（带 code）；5xx→接口错误；fetch reject→NETWORK；AbortError→504
- `chatWithImage`：成功（构造 `data:{mime};base64` URL）；结构异常→抛错
- `transcribe` / `assessPronunciation` / `synthesize`：均返回降级结果且不抛错

**7. 质量门（Phase 4 嵌入）**

- consistency: PASSED（`tsc --noEmit` 零错误 + `jest` 全绿 + 无全栈契约新增）
- tests: PASSED（unit: 1 file 全绿；e2e/bdd: 0 场景 —— 因 headless provider 豁免，见 §6）
- review: PASSED（0 open）
- optimization: PASSED（0 open；降级方法无 stub 残留，错误链路清晰）


---

## AI-103 — AiModule 动态装配

> 优先级 **P0** · 依赖 AI-102 · 状态 done

**目标**

把 `BigModelProvider`（AI-102）与 `MockAiProvider` 通过 NestJS 依赖注入**按 `.env` 的 `AI_PROVIDER` 动态装配**，业务模块只需 `@Inject(AI_PROVIDER_TOKEN)` 拿到 `AiProvider` 抽象，完全不绑定厂商。实现「无 key 时应用可启动」「切换 provider 只改 env 一处」。

**验收标准**

- [ ] `npm run build` / `tsc --noEmit` 通过，`AppModule` 能完成 Nest 上下文装配（DI 不报错）。
- [ ] `AI_PROVIDER=bigmodel` → 注入实例 `name === 'bigmodel'`（BigModelProvider）。
- [ ] `AI_PROVIDER` 缺失 / `mock` / 未知 / `nvidia` / `azure` → 注入实例 `name === 'mock'`（MockAiProvider），应用照常启动。
- [ ] 业务模块 `@Inject(AI_PROVIDER_TOKEN)` 取到 `AiProvider`，无 key 也能 boot。
- [ ] provider 切换只改 `.env` 的 `AI_PROVIDER` 一处，无需改代码。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（覆盖有逻辑分支的源码）**

- `ai.factory.spec.ts`：`createAiProvider` 对 `AI_PROVIDER` 各取值（bigmodel / mock / 缺失 / 未知 / nvidia / azure）返回正确 provider 实例；未实现 provider 路径触发 warn（用 spy 验证）。
- `mock-ai.provider.spec.ts`：`MockAiProvider` 的 `chat`/`chatWithImage`/`transcribe`/`assessPronunciation`/`synthesize` 均返回确定性、符合接口形状的结果且不抛错。
- `ai.module.spec.ts`：用 `@nestjs/testing` 编译含 `ConfigModule`+`AiModule` 的测试模块，`get(AI_PROVIDER_TOKEN)` 返回与 `AI_PROVIDER` 一致的 provider（验证 DI 动态装配这条核心链路）。

**7. 质量门（Phase 4 嵌入）**

- consistency: tsc --noEmit 0 错误；jest 全量 + 本 feature 3 个 spec 全绿；DI 装配测试通过
- tests: unit 3 files（ai.factory / mock-ai.provider / ai.module）；e2e/bdd 0 场景（headless 豁免，见 §6）
- review: 0 open（空安全 / 错误清晰 / 密钥不落日志 / 无 any / 无 stub 残留）
- optimization: 0 open（无占位死代码，回退路径有日志无吞错）


---

## AI-104 — MockProvider

> 优先级 **P0** · 依赖 AI-101 · 状态 done

**目标**

将 AI-103 建立的 `MockAiProvider` 基线**扩展为丰富、可信的确定性夹具**：`chat` 按意图返回固定「计划文本 / 报告文本 / 通用演示回复」，`assessPronunciation` 返回真实感假评分（非满分 + 弱音素），`transcribe` 返回示例句。使 **`AI_PROVIDER=mock` 时前端无需 key 即可跑通全流程演示**（plan / speech / report / chat 各场景都有像样的返回内容）。

**验收标准**

- [ ] `AI_PROVIDER=mock`（或缺省）下 `chat` 对计划/报告/通用三类输入分别返回对应固定文本。
- [ ] `assessPronunciation` 返回 score=88 且含 weakPhonemes（演示弱音素高亮与 encourage 表情）。
- [ ] `transcribe` 返回可读示例句。
- [ ] 内容与返回类型严格符合 `AiProvider` 接口；`name` 仍为 `'mock'`。
- [ ] 不依赖任何外部 API / key；结果完全确定性（同输入同输出，便于单测）。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（仅覆盖有逻辑分支的源码）**

- `mock-ai.provider.spec.ts`：
  - `chat` 计划意图 → 返回含 `[Mock 计划]` 文本；
  - `chat` 报告意图 → 返回含 `[Mock 今日小结]` 文本；
  - `chat` 通用意图 → 返回 `[Mock]` 演示回复；
  - `chat` 空消息 → 不崩溃，返回通用回复；
  - `chatWithImage` 仍返回 mime+prompt 文本（回归）；
  - `transcribe` 返回示例句 + confidence=1；
  - `assessPronunciation` 返回 score=88 + weakPhonemes=['θ','v'] + mascotExpr='encourage'；
  - `synthesize` 返回静音占位（回归）。

**7. 质量门（Phase 4 嵌入）**

- consistency: `tsc --noEmit` 0 错误；jest 全量全绿（含本 feature 单测），无回归。
- tests: 单元 1 文件 `mock-ai.provider.spec.ts` 全绿；BDD/E2E 0 场景（headless provider 豁免，见 §6）。
- review: 0 open（空安全、错误清晰、无注入风险、无 `any`、无魔法值泄漏到日志）。
- optimization: 0 open（无 stub 残留、无临时调试、意图关键词提取为私有常量）。


---

## AI-105 — 配置与密钥管理

> 优先级 **P0** · 依赖 AI-103 · 状态 done

**目标**

把散落在 `createAiProvider` 里的 `config.get(...)` 调用**集中为单一、类型化的 AI 配置读取**（`ai-config.ts` 的 `readAiConfig`），并在**应用启动（DI 装配期）**对「选中的真实 provider 缺 key」打印清晰告警；同时确认 `.env` 不进 git、`.env.example` 已含全部所需变量。让「配置从哪来、缺了会怎样」一目了然，便于后续 NVIDIA（AI-???）等 provider 接入。

**验收标准**

- [ ] `readAiConfig` 正确读取并归一化 `AI_PROVIDER`（大小写/空格容错，缺省 `mock`）。
- [ ] `readAiConfig` 对 `BIGMODEL_*`/`NVIDIA_*` 应用默认值，缺失 key 时为 `undefined`（不抛）。
- [ ] `AI_PROVIDER=bigmodel` 且缺 `BIGMODEL_API_KEY` → 启动期 `logger.warn` 被调用，应用仍可启动。
- [ ] `AI_PROVIDER=bigmodel` 且 key 存在 → 无缺 key 告警。
- [ ] `.env` 已在 `.gitignore` 中（不进 git）；`.env.example` 已被跟踪且含 `AI_PROVIDER`/`NVIDIA_*` 变量（验证，不重写）。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（仅覆盖有逻辑分支的源码）**

- `ai-config.spec.ts`：
  - 缺 `AI_PROVIDER` → `provider==='mock'`，bigmodel/nvidia 的 key 为 `undefined`，各 model/baseUrl 取默认值；
  - `AI_PROVIDER=bigmodel` + `BIGMODEL_API_KEY` 设置 → `bigmodel.apiKey` 正确，默认值正确；
  - `AI_PROVIDER=nvidia` + `NVIDIA_*` 设置 → `nvidia` 对象填充；
  - `AI_PROVIDER='  BigModel  '` → 归一化为 `bigmodel`。
- `ai.factory.spec.ts`（扩展）：
  - `AI_PROVIDER=bigmodel` 且缺 `BIGMODEL_API_KEY` → `logger.warn` 被调用（spy）；
  - `AI_PROVIDER=bigmodel` 且 key 存在 → 不触发缺 key 告警；
  - 既有 bigmodel/mock/nvidia/azure/unknown/大小写 用例回归（全部通过）。

**7. 质量门（Phase 4 嵌入）**

- consistency: `tsc --noEmit` 0 错误；jest 全量全绿（含本 feature 单测），无回归。
- tests: 单元 2 文件（`ai-config.spec.ts` + 扩展 `ai.factory.spec.ts`）全绿；BDD/E2E 0 场景（headless 配置逻辑豁免，见 §6）。
- review: 0 open（空安全：缺失 key 为 undefined 不崩；告警信息清晰；无 `any`；不泄露 key 到日志）。
- optimization: 0 open（无 stub 残留、无调试代码、配置读取单一来源）。


---

## AI-106 — 重试与降级

> 优先级 **P0** · 依赖 AI-103 · 状态 done

**目标**

为 **provider 调用层** 增加统一的「瞬时错误重试 + 并发保护 + 错误归一化」，使所有消费方（AI-202/303/304/402/502/601）免费获得韧性，无需各自写 try/catch 重试。

- `chat` / `chatWithImage`（真实网络调用）包 3 次指数退避重试。
- 超时（默认 60s，推理模型）、网络错误、`429 限流`、`5xx` 视为**瞬时错误** → 退避重试。
- `401/403` 鉴权失败、NVIDIA `404 Function not found for account` → 识别为**账户权限错误**（`AiAccessError`），**不重试**，给出明确文案。
- 其余 4xx（含 BigModel 结构异常 `502`）→ **永久错误**，不重试。
- **并发保护**：`chat/chatWithImage` 经信号量限流（默认并发上限 4），避免自伤式触发 `429`（对应 backlog「降低并发」）。

**验收标准**

- [x] 模拟 5xx/429 自动重试（withRetry 单测 + 包装器单测）
- [x] 连续失败抛可识别异常（耗尽抛原始 `AiProviderException`，保留 statusCode/code）
- [x] 权限错误给出明确文案（401/403 → `AiAccessError`「账户权限问题」；NVIDIA 404 FUNCTION_NOT_FOUND 分类为 access）

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**5. 测试计划（TEST-101 全量覆盖）**

- `ai-retry.spec.ts`：classifyError 全分支（429/0/504/5xx/401/403/404-FUNCTION_NOT_FOUND/502/其它4xx/未知）；withRetry 首试成功、一次重试后成功、耗尽抛可识别异常、access 不重试、permanent 不重试、maxAttempts 尊重；normalizeError。
- `concurrency-limiter.spec.ts`：上限并发、释放唤醒、全部完成。
- `retryable-ai-provider.spec.ts`：chat 一次瞬失败后成功（重试生效）、chatWithImage 同理、transcribe/assess/synthesize 直接委托、name 透传、限流不抛错。
- 更新 `ai.factory.spec.ts` / `ai.module.spec.ts` 断言为 `name` 契约。


---

## AI-107 — 每日 token/调用配额

> 优先级 **P1** · 依赖 AI-106 · 状态 done

**目标**

为 AI 能力增加「每用户每日配额」闸门：限制单用户每日 AI 调用次数与 token 用量，
超限返回 **429 + 降级标记（degraded）**，避免单用户刷爆额度 / 失控成本。配额数据
持久化到 `ai_usage` 表，可检索、可审计（与 AI-108 日志互补）。

价值：在 M2+ 真正接入 AI 控制器前，先把配额引擎与 provider 外壳就位，使所有
`AiProvider` 消费方（plan / speech / chat / report）免费获得配额保护。

**验收标准**

- [ ] `AiUsage` 实体注册、`ai_usage` 表随 schema 同步建立。
- [ ] 配小额配额（如 `AI_DAILY_CALL_LIMIT=2`）连续调用可触发 429（`AiQuotaExceededError`）。
- [ ] token 用量超额同样触发 429（以累计 token 判断）。
- [ ] 配额数据持久化（`findOne`/`save` upsert），跨日自动开新行。
- [ ] `name` 契约不变；配额错误位于最外层、不进入 AI-106 的 `withRetry` 重试。
- [ ] 单元测试覆盖：配置读取 / 状态计算 / 超限分支 / 记账 / 外壳编排（含 inner 抛错不计费）。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（覆盖有逻辑分支的源码）**

- `ai-quota.spec.ts`：`readAiQuotaConfig`（缺省/覆盖/非法回退默认）、`computeQuotaState`
  （剩余量计算、达上限 `limited=true`、Math.max 下界）。
- `ai-usage-limit.service.spec.ts`：`getState`（无行=0 / 有行）、`assertWithinQuota`
  （通过 / 调用数超限 / token 超限 / 恰好相等不拦截）、`recordUsage`（首建行 / 累加 /
  跨日开新行 / token 累计）。
- `usage-limited-ai-provider.spec.ts`：chat 正常（assert+inner+record，token 透传）、
  chat 超限（inner 不调用、不记账）、chat inner 抛错（不记账、错误透传）、
  chatWithImage/transcribe/assess/synthesize（计 0 token）、`name` 透传、自定义 resolver。

**7. 质量门（Phase 4 嵌入）**

- consistency: `nest build` + `tsc --noEmit` 通过；`jest` 全绿；无全栈契约（纯后端）。
- tests: `unit: 3 files（ai-quota / ai-usage-limit.service / usage-limited-ai-provider）`；e2e/bdd: 0（legacy 豁免）。
- review: 0 open（空安全 / 失败不计费 / 429 不重试 / 错误透传）。
- optimization: 0 open（无 stub、日志到位、常量提取）。


---

## AI-108 — AI 调用日志

> 优先级 **P1** · 依赖 AI-106, LOG-101 · 状态 done

**目标**

为每次 LLM 调用留下**可检索、可审计**的记录：谁（userId）、哪个模块（moduleTag）、走了哪个 provider、消耗多少 token、耗时多少、成功/失败、输入/输出摘要（敏感内容截断）。记录同时落 **LOG-101 结构化日志文件**（即时 grep）与 **`ai_call_logs` 表**（按用户/日/模块聚合做成本审计）。便于排查线上问题与统计 AI 成本，且不泄露儿童隐私（输入 prompt / 输出文本一律截断）。

**验收标准**

- [ ] 每次 LLM 调用（含被配额拦截/失败）都有一条可检索日志（logger 文件 + 表）。
- [ ] 输入/输出摘要被截断（默认 200 字符），不把儿童原始录音/长文本全量写入日志或表。
- [ ] 审计写库失败不阻断主 AI 调用（best-effort）。
- [ ] 覆盖率：新增有逻辑分支源码单测全绿（≥ 90% stmts / 70% branches 全局基线）。
- [ ] `nest build` / `tsc` 0 错误；jest 全绿；pre-commit 质量门强执通过。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（覆盖有逻辑分支的源码）**

- `ai-call-log.service.spec.ts`：`record` 成功落库；error 路径写 `status='error'`+`errorMessage` 截断；超长 snippet 截断；repo.save 抛错时方法不抛（best-effort）。
- `logged-ai-provider.spec.ts`：5 个方法经 `runLogged` 编排；成功 → status ok + 提取 token + 截断 request/response；失败 → 透传异常且记 status error；`name` 透传；多模态只记 prompt 不记 base64；transcribe/assess/synthesize 的 snippet 不写音频数据。
- `ai.module.spec.ts`：适配新增 `AiCallLog` 仓库覆盖（加 `getRepositoryToken(AiCallLog)` override），provider 仍可正确装配（name 契约不变）。

**7. 质量门（Phase 4 嵌入）**

- consistency: `nest build`/`tsc` 0 错误；jest 全绿；纯后端无全栈契约。
- tests: 单元测试 3 文件（service / provider / module 适配）全绿；BDD/E2E 0（legacy 豁免）。
- review: 0 open（边界/空安全/敏感截断/审计不阻断/无裸 console）。
- optimization: 0 open（无 stub、统一 error 处理、移除临时调试）。


---
