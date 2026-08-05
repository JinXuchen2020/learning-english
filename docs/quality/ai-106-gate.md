# AI-106 质量报告 · 重试与降级

- **分支**: `feat/ai-106`（建在 `feat/ai-105` 之上，未 push）
- **栈**: node-ts (NestJS 10)
- **Quality-Gate**: `consistency + tests + review + optimization` 全 PASSED，`cleared: true`，`enforced: true`

## 一致性（consistency）
- `tsc --noEmit` 0 错误。
- `jest` 全量 **30 suites / 172 tests 全绿**，无回归。
- 契约对齐：`createAiProvider` 返回值由具体 provider 变为 `RetryableAiProvider`（仍实现 `AiProvider`、保留 `name`），消费方 `@Inject(AI_PROVIDER_TOKEN)` 契约不变；既有 `ai.factory.spec.ts` / `ai.module.spec.ts` 的 `instanceof` 断言改为基于 `name` 契约（消费方实际依赖）。

## 测试（tests）
- 新增单测 3 文件 **33 用例**全绿：
  - `ai-retry.spec.ts`：classifyError 全分支（429/0/504/5xx-非502/401/403/404-FUNCTION_NOT_FOUND/502/其它4xx/未知）、withRetry（首试成功 / 一次重试后成功 / 指数退避 / 耗尽抛可识别异常保留 statusCode / access 不重试 / permanent 不重试 / maxAttempts 尊重）、normalizeError。
  - `concurrency-limiter.spec.ts`：上限并发、释放唤醒、全部完成、拒绝 max<1、reject 仍释放槽位。
  - `retryable-ai-provider.spec.ts`：chat 一次瞬失败后成功、chatWithImage 同理、transcribe/assess/synthesize 直接委托、name 透传、默认重试选项与限流器回退。
- 覆盖率：新文件 `ai-retry.ts` 95.55% stmts / 92.3% branches（`delay` 默认真实睡眠分支仅生产路径，单测注入 no-op）、`concurrency-limiter.ts` 100%、`retryable-ai-provider.ts` 100%。
- **BDD/E2E 0 场景**：AI-106 是无端点/无 UI 的调用层韧性基建，按 feature-builder 硬约束 #6「不为纯后端 API 写 BDD」**显式豁免**；其端到端行为由消费方 feature（AI-202 `/plan`、AI-303/304 口语、AI-402 TTS、AI-502 报告、AI-601 卡片）自带覆盖。豁免载明于 `features/ai-106.md §6` 与本报告。

## 审查（review）— 0 open
- 401/403 鉴权失败改为抛 `AiAccessError`，文案含「账户权限问题（key 无效或过期）」，明确提示用户。
- `classifyError` 对 BigModel 结构异常 `502`（缺 content）判 `permanent`，避免对坏结构盲目重试；真正网关 5xx（500/501/503/…）判 `retryable`。
- NVIDIA `404 Function not found for account`（code `FUNCTION_NOT_FOUND`）识别为 `access`，经 `normalizeError` 映射为 `AiAccessError`，满足 backlog「映射为 AiAccessError 提示账户权限问题」。
- 重试耗尽后抛**最后一次**错误，保留原始 `statusCode`/`code`，可识别（满足「连续失败抛可识别异常」）。
- 未知裸 `Error` 判 `permanent`，不盲目重试。

## 优化（optimization）— 0 open
- 无 stub 残留、无 `any`、密钥不进日志（告警只提变量名）。
- 重试/限流纯内存（信号量 + 指数退避），**不写库**，与 AI-107 配额 / AI-108 日志解耦。
- `AiAccessError` 与 `normalizeError` 统一错误出口，便于消费方与未来 NvidiaProvider 复用。
- `MockAiProvider` 对重试/限流透明（方法永不动网络、永不抛错）。

## 边界（不越界）
- 不新增 env 变量 / 不改 `.env.example` / 不碰 `.gitignore`（密钥不进 git 由 AI-105 已覆盖）。
- 不新建 provider 类；不改 `AiProvider` 接口签名；不实现 NvidiaProvider（仅分类支持其错误码）。
- 不接 AI-107 配额 / AI-108 调用日志；重试/限流不落库。
- 并发上限提供**固定**能力（满足「降低并发」）；自适应收缩（命中 429 后动态调小上限）留作后续增强，已在 `features/ai-106.md §2.2` 标注。

## 验收对照（来自 backlog）
- [x] 模拟 5xx/429 自动重试 → `withRetry` 单测 + `retryable-ai-provider` 包装器单测
- [x] 连续失败抛可识别异常 → 耗尽抛原始 `AiProviderException`（保留 statusCode/code）
- [x] 权限错误给出明确文案 → 401/403 → `AiAccessError`「账户权限问题」；NVIDIA 404 FUNCTION_NOT_FOUND 分类为 access
