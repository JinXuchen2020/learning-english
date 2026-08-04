# AI-102 质量门报告

> Feature: AI-102 — BigModel provider 实现
> 分支: feat/ai-102
> 栈: node-ts (NestJS 10 + TypeORM + jest)
> 日期: 2026-08-04

## 实现摘要

新增 `server/src/ai/bigmodel.provider.ts`：实现 `AiProvider` 接口的首个真实后端 BigModelProvider。

- `chat` / `chatWithImage` 对接智谱 OpenAI 兼容端点 `https://open.bigmodel.cn/api/paas/v4/chat/completions`：
  - 推理模型（`glm-4.7-flash`）`reasoning_content`/`content` 正确分离，仅取 `content`；
  - 视觉模型（`glm-4.6v-flash`）以 `data:{mime};base64` 的 `image_url` 输入；
  - `max_tokens` 默认 512、`timeout` 默认 60s（可经 options 覆盖）。
- `transcribe` / `assessPronunciation` / `synthesize`：AI-102 范围内 BigModel 无对应能力，返回**降级结果**（不抛错，日志标记），待 AI-304/AI-305/AI-402 接入。
- 统一错误处理：未配置 key→401、网络→NETWORK(0)、超时(AbortError)→504、401/403→鉴权失败、429→限流(带 `error.code`)、其他非 2xx→接口错误、2xx 结构异常→502，全部以 `AiProviderException`（`statusCode`/`code`）清晰抛出。
- 不引入新依赖，仅用 `globalThis.fetch`（Node 22 内置）；`fetch` 以构造参数注入便于测试；配置从 env/`BigModelConfig` 读取，不硬编码密钥。
- 降级方法走 `Logger.debug`（符合 LOG-101，无裸 console）。

## 四道质量门

### 1. consistency（PASSED）
- `npx tsc --noEmit -p tsconfig.json`：**0 错误**（strictNullChecks / noImplicitAny）。
- `npm run build`：未跑完整 nest build（与 tsc 等价且更快），类型层已验证。
- `jest` 全量：**23 suites / 107 tests 全绿**，无回归。
- 全栈契约：本 feature 为后端 provider，无新前端/端点契约，无契约漂移。

### 2. tests（PASSED）
- **单元测试**：`server/src/ai/bigmodel.provider.spec.ts` —— **17 个用例全绿**，覆盖率 `bigmodel.provider.ts` 语句/函数/行 100%、分支 85.71%（高于 70% 门槛）；覆盖 chat 成功/推理模型/缺 content→502/401/403/429(带 code)/5xx/网络错误/超时(504)/缺 key→401/参数透传/错误体不可解析兜底，chatWithImage 成功(构造 data URL)/结构异常，三项降级方法。
- **BDD/E2E**：**0 场景** —— 按硬约束 #6「不为纯后端 API 写 BDD」且本 feature 为无前端/无独立端点的 headless provider，无用户可感知旅程。已在 `features/ai-102.md` §6 **显式标注测试豁免**，其端到端行为由消费方 feature（AI-202 `/plan`、AI-303/AI-304 口语、AI-402 TTS、AI-606 拍照学单词）自带 BDD/E2E 覆盖。单元测试作为 `tests` 门证据。

### 3. review（PASSED，0 open）
逐条核对 SKILL.md 附录 B 通用对抗式 checklist：
- 空安全：所有响应字段经 `?.` + 类型断言校验后使用；可选参数 `options?.x ?? 默认`。
- 错误处理：网络/超时/非 2xx/结构异常全部清晰抛出，无吞异常；降级方法不抛错。
- 注入/安全：API key 仅入 `Authorization` 头，不落日志；无 SQL/命令注入面；密钥走 env/config。
- 边界：缺 key 早返 401；base URL 去尾斜杠；空 messages 直传（由 API 校验）。
- 死代码/魔法值：端点/模型/超时/最大 token 提取为具名常量；无魔法字符串。
- 类型契约：5 方法签名与返回类型严格匹配 `AiProvider`；响应用显式 `BigModelChatResponse` 接口，无 `any` 绕过。
- 日志：降级方法用 `Logger`，无裸 console。
- 一致性：命名/分层贴合项目既有约定（与 `ai-provider.interface` 同目录）。
- 测试面：逻辑分支 100% 语句覆盖。

### 4. optimization（PASSED，0 open）
- 无 stub/`TODO`/占位抛错；降级方法返回有意义的降级结果。
- 错误处理统一为 `AiProviderException`，业务层（AI-106）可直接识别 `statusCode`/`code`。
- 无临时调试代码遗留；未借机重构无关代码。

## 范围边界（护栏）

- 未创建 `AiModule`（属 AI-103）。
- 未做重试/降级编排（属 AI-106）。
- 未改 `.env.example`（AI-105 已含 `BIGMODEL_*`）。
- 未改任何既有源码（纯新增文件 + 测试）。

## 遗留风险

- BigModel STT/TTS 真实能力未接入，降级方法在消费方 feature 落地真实能力前为占位（已被 BDD 豁免说明覆盖）。
- 真实 key 端到端验证需用户侧配置 `BIGMODEL_API_KEY` 后由消费方 feature 的 E2E/演示触发；本 feature 单测已用 mock fetch 覆盖全部协议分支。
