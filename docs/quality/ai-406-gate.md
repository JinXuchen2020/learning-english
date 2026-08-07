# AI-406 质量门报告

> 配套 `.quality-gate.json`（flat 格式，pre-commit hook 已校验 `cleared:true` + 四 gate PASSED）

## 概述

AI-406 = **内容安全双保险**。为儿童英文陪练对话（`POST /api/ai/chat/messages`）在文本送入 LLM 之前加两道闸门：关键词黑名单（同步硬闸）+ NVIDIA 内容安全分类器（异步语义兜底）。任一命中即返回狐狸吉祥物**安全兜底回复**，不调用 LLM、不暴露拦截细节。

## 质量门

| 门 | 结果 | 依据 |
|---|---|---|
| consistency | PASSED | nest build 0 错；jest **530/530** 全绿（较 AI-405 的 515 +15）；无 DB schema 变更（纯新增静态安全配置 + 只读拦截逻辑） |
| tests | PASSED | unit 530/530；新增 15 case（classifier 6 + service 6 + chat.service 安全拦截 3）；e2e/bdd 0（纯后端豁免，约束 #6） |
| review | PASSED | 双保险架构清晰；fail-open 降级（黑名单仍为硬闸）；拦截不调 LLM；响应形状不变 |
| optimization | PASSED | 黑名单优先于分类器（省网络）；归一化匹配降误伤；NvidiaSafetyClassifier 与 BigModelProvider 同构（FetchFn 可注入） |

## 改动文件

- 新增 `server/src/chat/chat-safety.config.ts` — `SAFETY_BLOCKLIST`（中英文黑名单，启发式、可扩展）+ `matchBlocklist` + `SAFE_FALLBACK_REPLY`
- 新增 `server/src/chat/chat-safety.classifier.ts` — `SafetyClassifier` 接口 + `NvidiaSafetyClassifier`（HTTP 调 NVIDIA `nvidia/llama-3.1-nemoguard-8b-content-safety`，fail-open 降级，FetchFn 可注入）
- 新增 `server/src/chat/chat-safety.service.ts` — `ChatSafetyService.checkUserInput`（双保险编排，经 `@Inject(SAFETY_CLASSIFIER_TOKEN)`）
- 改 `server/src/chat/chat.service.ts` — 注入 `ChatSafetyService`，LLM 调用前拦截，不安全 → 安全兜底回复（同样 TTS）
- 改 `server/src/chat/chat.module.ts` — 装配 `SAFETY_CLASSIFIER_TOKEN`（ConfigService 读 `NVIDIA_*`）+ `ChatSafetyService`
- 测试：chat-safety.classifier.spec / chat-safety.service.spec（新）；chat.service.spec（扩安全拦截 3 case）；chat.module.spec（加 `ConfigModule.forRoot({isGlobal:true})` 支撑分类器工厂）

## 契约与行为

```
sendMessage(dto):
  verdict = safety.checkUserInput(dto.text)   // 黑名单 → 命中即拦；否则 NVIDIA 分类
  if !verdict.safe:
    replyText = SAFE_FALLBACK_REPLY            // 不调 LLM
  else:
    replyText = provider.chat(...)             // 正常流程
  // 统一落库 user + assistant(replyText) + 合成 TTS
```

- **fail-open（降级放行）**：`NVIDIA_API_KEY` 未配置 / HTTP 非 2xx / 网络·超时·解析异常 → 均放行（黑名单仍是硬闸）。避免安全服务抖动时全站不可用。
- **黑名单匹配**：文本与关键词统一小写 + 去空白 + 去非字母数字/非 CJK 标点后子串匹配；选用无歧义词条降误伤。
- 响应形状 `{ sessionId, messageId, replyText, ttsUrl }` 不变，前端契约不受影响。

## 越界声明

- 输出侧硬过滤（对已生成回复再过滤）→ 后续 hardening，不在 M4。
- 前端 `/chat` 场景卡渲染与 TTS 自动播 → **AI-407**。

## 提交

本地分支 `feat/ai-406`，`git commit` 不 push（skill 规则）。pre-commit hook 校验 `.quality-gate.json` flat 格式四门 PASSED 放行。
