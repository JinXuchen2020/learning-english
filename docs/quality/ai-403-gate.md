# AI-403 质量门报告

**Phase**: ai-403 · **Stack**: node-ts (NestJS 10 + TypeORM，better-sqlite3/postgres 双驱动)
**Date**: 2026-08-06 · **Branch**: feat/ai-403 (from feat/ai-402)

## 一句话结论
AI-403（对话陪练聊天接口）四道质量门 **全部 PASSED**，pre-commit 质量门强执放行，已提交（未 push）。本 feature 落地 `POST /api/ai/chat/messages`：结合会话历史 + 狐狸人设场景系统提示调用 LLM 生成回复，落库 `ai_chat_sessions` / `ai_chat_messages`，并用 AI-402 的 TTS 能力产出狐狸音色朗读音频引用一并返回，为 AI-407（`/chat` 前端页面）提供数据底座。

## 实施了什么
- **接口**（`server/src/chat/chat.controller.ts`，`ChatModule` 内，全局前缀 `api`）：`POST /api/ai/chat/messages`
  - 请求 `ChatMessageDto`：`text`(必填,非空,≤2000) / `sessionId?`(续聊,不存在→404) / `sceneId?`(≤64,新建会话时写入) / `userId?`(默认 `anonymous`)。
  - 响应 `ChatSendResponse`：`{ sessionId, messageId, replyText, ttsUrl }`。
  - 错误：`ChatError`→`HttpException`：`404 CHAT_SESSION_NOT_FOUND` / `429 AI_RATE_LIMITED` / `502 AI_GENERATION_FAILED` / `503 AI_UNAVAILABLE`；入参非法经全局 `ValidationPipe` 自动 400。
- **编排**（`chat.service.ts`）：解析/创建会话 → 加载历史（按 `createdAt` 升序）→ 组装 `[system, ...history, user]` → `provider.chat`（低温度 0.6 / maxTokens 512）→ 落库 `user` + `assistant` 消息 → `provider.synthesize` → `ttsUrl` 归一化（`audioUrl` 透传 / `audioBase64`→`data:${mime};base64,...` / 无音频→`null`）。
  - LLM 失败经鸭子类型 `statusCode` 映射为 `ChatError`（不绑定具体 provider）；TTS 失败**优雅降级**（`ttsUrl=null`，不阻断文本回复）。
  - 底层 `provider` 经全局 `AiModule` 的 `AI_PROVIDER_TOKEN` 注入（链 `Logged(UsageLimited(Retryable(inner)))`），`ChatModule` 无需 import `AiModule`。
- **系统提示**（`chat-system-prompt.ts`，纯函数）：`FOX_PERSONA`（儿童英语陪练狐狸人设）+ 5 已知场景 framing（greeting/zoo/shopping/weather/body）+ 基线安全规则（儿童守护：不收集隐私/不引外链/温柔拉回）。丰富「场景包模板 + 内容安全双保险」明确留待 **AI-405 / AI-406**，本 feature 不越界。
- **复用 AI-401 实体**：无新表/字段；`audioPath` 持久化音频明确留待 **AI-407**（避免 512 varchar 存超长 data URI，本 feature 仅经响应 `ttsUrl` 返回即时播放引用）。

## 四道质量门
| 门 | 结果 | 关键证据 |
|---|---|---|
| consistency | PASSED | `nest build` 0 错；`jest 494/494` 全绿（较 AI-402 的 464 +30）；无 schema 变更故无 seed 建表需求；纯后端 API，AI-407 前端接入时对齐契约 |
| tests | PASSED | 单元：新增 `chat.service.spec` 11 case（新建/复用会话、404、历史组装、ttsUrl 归一化三分支、TTS 优雅降级、provider 错误映射 429/503/502）+ `chat.controller.spec` 7 case（响应透传、ChatError→HttpException、异常透传、ValidationPipe 拒非法/额外字段）+ `chat-message.dto.spec` 8 case + `chat-system-prompt.spec` 5 case；更新 `chat.module.spec` 补 `AI_PROVIDER_TOKEN` mock（模块仍编译 + 建表断言不变）；**BDD/E2E 0**——纯后端聊天 API，端到端旅程（选场景→对话→狐狸朗读）属 AI-407 的 `/chat` 页面，按约束 #6 豁免 |
| review | PASSED | 0 open；错误分类清晰（429/401·403/其它 → 对应 ChatError，经 HttpException 不含裸状态码）；TTS 优雅降级；userId 默认 `anonymous` 与 AI-108/评测 DTO 一致；关联 varchar 引用（非硬外键）；系统提示常量化 + 纯函数可单测；无裸 console；场景 Prompt 范围不越界（AI-405/AI-406 留接口） |
| optimization | PASSED | 0 open；无 stub/占位；响应形状稳定；TTS 归一化复用 `AudioResult`；audioPath 持久化决策显式留待 AI-407；无临时调试代码 |

## 文档同步
- `features/backlog.md`：AI-403 状态 → **done**。
- `docs/ai-integration.md`：聊天端点伪代码细化为真实契约（route 已是 `POST /api/ai/chat/messages`；响应补全 `sessionId`/`messageId`，并注明 `userId?` 默认 `anonymous`、已落地于 AI-403）。

## 历史注记
- AI-403 之前 `docs/ai-integration.md` 的聊天端点为设计草图（`→ 返回 {replyText, ttsUrl}`），现已落地为含 `sessionId`/`messageId` 的完整契约。

## 提交
- 分支 `feat/ai-403`，commit 未 push（按 feature-builder 规定仅 commit 不 push）。
- 链状态：`feat/ai-209 → … → feat/ai-402 → feat/ai-403` 全部本地已提交未 push。

## 下一步
- backlog M4 下一个可独立交付项：**AI-405（场景包 ScenePrompt 模板 + 内容安全双保险）**（增强本 feature 的场景 Prompt 与儿童安全层）或 **AI-407（`/chat` 前端页面 + 调用本接口 + 狐狸音色自动播放）**。AI-403 的聊天能力待 AI-407 落地消费。
