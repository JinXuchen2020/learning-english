# AI-407 质量门报告

> 配套 `.quality-gate.json`（flat 格式，pre-commit hook 已校验 `cleared:true` + 四 gate PASSED）

## 概述

AI-407 = **`/chat` 会话 UI 页面**。在已落地的后端聊天接口（AI-403 `POST /api/ai/chat/messages`、AI-405 `GET /api/ai/chat/scenes`、AI-406 内容安全双保险）与口语评测管线（AI-307 `SpeechRecorder` + `evaluateSpeech`）之上，补齐面向儿童的**前端对话陪练界面**：场景选择卡 + 气泡对话 + 狐狸吉祥物 TTS 语音条自动播 + 每条回复「跟读」复用录音评测。纯前端 feature，无后端代码改动。

## 质量门

| 门 | 结果 | 依据 |
|---|---|---|
| consistency | PASSED | frontend `tsc --noEmit` 0 错误；`next build` 通过；vitest **78/78** 全绿（较基线 +11：新增 `lib/audio.spec` 8 case + `lib/api.spec` 扩 `getChatScenes`/`sendChatMessage` 3 case）；无 DB schema 变更（复用既有后端端点与 `SpeechRecorder`）；无新依赖 |
| tests | PASSED | unit vitest 78/78；e2e/bdd `chat.feature` **6 scenarios / 52 steps** 全绿（约束 #6 前端功能必做 BDD，非 legacy 豁免）；全部后端路由 `page.route` 打桩（scenes/reply/safety-fallback/evaluate），不依赖真实 LLM 与 AI 配额，稳定无 flake |
| review | PASSED | TTS 自动播抽离为纯函数 `lib/audio.ts` 可单测；跟读复用 `SpeechRecorder`+`evaluateSpeech` 不重复实现；`data-component` 钩子齐全便于 E2E 断言；无裸 console；安全兜底由 AI-406 后端处理，前端仅展示不越界；场景内容走后端枚举不硬编码 |
| optimization | PASSED | 无 stub/占位；`playTts` 复用 Audio API 自动播失败静默降级；场景数据走枚举端点避免前端重复维护；评测走既有管线零重复；headless 自动播仅测试加 `--autoplay-policy` flag；无临时调试代码 |

## 改动文件

### 新增
- `src/app/chat/page.tsx` — `ChatPage`(`AuthGate` 包裹) → `ChatInner`：场景加载(`getChatScenes`)、`SceneCards`/`SceneCard[data-scene-id]`、`SceneVocab`、开场种子气泡、`ChatThread`/`ChatBubble[data-role][data-opening]`、`ChatInput`/`ChatComposer`、`ChatTtsAudio`(autoPlay + 手动 🔊)、`ReadAlongPanel`(复用 `SpeechRecorder` + `evaluateSpeech`)。Enter 发送、空消息禁用；狐狸回复后 `playTts(res.ttsUrl)` 自动播。
- `src/lib/audio.ts` — 纯 TTS 逻辑：`normalizeTtsUrl(ttsUrl): string|null`（放行 `data:`/`http(s):`，否则 null）、`playTts(url, createAudio?): boolean`（创建 `Audio`，`el.src=finalUrl; el.autoplay=true; el.play()`，自动播被拒 `.catch` 吞掉）。
- `src/lib/audio.spec.ts` — 8 个 Vitest case（normalizeTtsUrl 3 态、playTts 分支含 data URI、自动播被拒吞错、factory 抛错 → false）。
- `src/e2e/support/pages/chat.ts` — `ChatPage` POM：`open()`（经 `nav a[href="/chat"]` 客户端导航 + 注入假麦克风）、`mockScenes`/`mockChatReply`/`mockChatSafetyFallback`/`mockEvaluate`、`selectScene`、`isOpeningBubbleVisible`/`isVocabVisible`、`typeMessage`/`clickSend`/`userBubbleCount`/`assistantBubbleCount`、`ttsAudioCount`/`ttsAudioSrc`/`isTtsAutoplaying`、`clickReadAlong`/`recordReadAlong`/`submitReadAlong`/`waitReadAlongFeedback`/`isReadAlongStarVisible`。
- `src/e2e/features/chat.feature` — 6 scenarios（场景卡+输入框；选场景→开场+词汇；发送→回复+TTS 自动播；多轮；跟读攒星；安全兜底）。
- `src/e2e/step-definitions/chat.steps.ts` — step defs；`STUB_SCENES`(2 场景) + `FOX_VOICE_WAV`(有效静音 WAV data URI，headless 自动播需真实可播放音频)；多轮断言 `nth(before)` 等第 N 个回复气泡出现。
- `features/ai-407.md` — 设计文档（目标、契约、UI `data-component` 钩子、边界、测试策略）。

### 修改
- `src/lib/types.ts` — 新增 `ChatScene`/`ChatMessage`/`SendChatMessageDto`/`SendChatMessageResponse`（对齐后端 `SceneSummary`/`ChatSendResponse`/`ChatMessageDto`）。
- `src/lib/api.ts` — 新增 `getChatScenes(): Promise<ChatScene[]>`（`GET /api/ai/chat/scenes`）+ `sendChatMessage(dto): Promise<SendChatMessageResponse>`（`POST /api/ai/chat/messages`）。
- `src/lib/api.spec.ts` — 扩 `getChatScenes`/`sendChatMessage` 3 case。
- `src/components/TabNav.tsx` — tabs 新增 `{ href: "/chat", label: "Chat", icon: MessageCircle }`。
- `src/e2e/support/hooks.ts` — launch args 加 `--autoplay-policy=no-user-gesture-required`（headless TTS 自动播）。
- `features/backlog.md` — AI-407 `doing` → `done`。
- `docs/ai-integration.md` — 「前端 /chat」段由设计意图补全为 AI-407 落地说明（TabNav 入口、`data-component` 钩子、TTS 自动播、跟读复用、E2E 覆盖）。

## 契约与行为

```
open /chat:
  scenes = getChatScenes()           // GET /api/ai/chat/scenes → ChatScene[]{id,title,openingLine,targetVocabulary}
  render SceneCards; 无场景/失败 → 友好提示(不白屏)
selectScene(id):
  openingBubble = assistant(openingLine, data-opening=true)  // 开场种子气泡
  show SceneVocab(targetVocabulary)
sendMessage(text):
  res = sendChatMessage({text, sceneId})   // POST /api/ai/chat/messages → {sessionId,messageId,replyText,ttsUrl}
  push user(text) + assistant(replyText, data-opening=false)
  playTts(res.ttsUrl)            // 自动播; 失败静默降级
readAlong(firstReply):
  SpeechRecorder 录音 → evaluateSpeech({audio, ...})  // POST /api/ai/speech/evaluate → {score,feedback,...}
  show ReadAlongFeedback; 通过攒星逻辑属 AI-408
```

- **TTS 自动播**：`playTts` 创建 `Audio`，`autoplay=true`、`play()` 被拒 `.catch` 吞掉；headless 需 `--autoplay-policy=no-user-gesture-required` + **有效音频** data URI（无效 base64 mp3 仍 `paused`，测试用真 WAV）。
- **安全兜底**：用户输入触发 AI-406 拦截时后端直接返回 `SAFE_FALLBACK_REPLY`，前端按普通回复渲染（含 TTS），不额外处理内容安全。
- **多轮竞态修复**：`clickSend` 等待「第 `before` 个回复气泡（`.nth(before)`）出现」而非 `.first().waitFor()`，避免已有气泡时瞬间 resolve 导致断言早于渲染。

## 越界声明

- 对话星标/鼓励动画/持久化 → **AI-408**（本 feature 的 ReadAlong 面板已预留 `isReadAlongStarVisible` 钩子，星形由 AI-408 触发）。
- 会话历史与续聊 → **AI-409**。
- 后端内容安全拦截逻辑 → **AI-406**（前端不重复实现）。

## 提交

本地分支 `feat/ai-407`，`git commit` 不 push（skill 规则）。pre-commit hook 校验 `.quality-gate.json` flat 格式四门 PASSED 放行。

## 验证记录

| 项 | 命令 | 结果 |
|---|---|---|
| 单元测试 | `npx vitest run` | 78/78 passed |
| 前端类型 | `npx tsc --noEmit` | 0 错误 |
| E2E 类型 | `npm run typecheck:e2e` | 0 错误 |
| 对话 E2E | `cucumber-js e2e/features/chat.feature`（其余 feature 临时移出） | 6 scenarios / 52 steps passed（exit 0） |
