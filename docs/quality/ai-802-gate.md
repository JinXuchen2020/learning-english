# AI-802 质量门报告 — 聊天语音输入（Chat Voice Input）

> 栈: node-ts (Next.js 14 前端, 纯客户端) | 分支: feat/ai-802 | 日期: 2026-08-18

## 实现摘要

给 `/chat` 聊天输入框新增 🎤 语音输入入口，复用浏览器原生 **Web Speech API** 做实时英文听写，让孩子不用键盘也能对狐狸老师说英语。识别结果仅作为输入框文本，发送沿用既有 `POST /api/ai/chat/messages`（**零新增后端 API**）。

- **`src/lib/speech-dictation.ts`（纯逻辑，可单测）**
  - `getSpeechRecognitionCtor(win?)`：取 `SpeechRecognition ?? webkitSpeechRecognition`，无则 `null`。
  - `isSpeechDictationSupported(win?)`：需「有构造器 **且** 安全上下文(HTTPS/localhost)」——Firefox / 非安全上下文自动降级。
  - `applySpeechResult(prev, event, resultIndex)`：纯函数合并 onresult 事件，区分 final（增量追加，返回 `finalDelta`）与 interim（仅预览），正确处理累积 `results` + `resultIndex` 语义。
- **`src/lib/useSpeechDictation.ts`（React hook）**
  - 暴露 `{ supported, listening, interim, start, stop }`；`start()` 新建实例、绑 `onresult/onerror/onend`、设 `lang=en-US, interimResults=true, continuous=true`；
  - `onend` 在仍 `listening` 意图时自动重启（避免「说一半突然停」），手动 `stop()` 落停不重启；`onerror` 仅记 `warn` 不抛、不破坏输入；卸载时 `abort()` 防泄漏；`onFinal` 经 ref 持有最新回调。
- **`src/app/[locale]/chat/page.tsx`**：`ChatInner` 接线 `useSpeechDictation("en-US", { onFinal })`；`ChatComposer` 左侧渲染 🎤 按钮（`supported` 时点击切换 start/stop、listening 加 `animate-pulse`；不支持时 `disabled` + tooltip 提示）；`final` 片段增量追加 input（发送前可编辑）；`interim` 实时预览条（`data-component="VoiceInterim"`）。
- **i18n**：`Chat` 命名空间中英补 `voiceInput` / `tapToSpeak` / `voiceNotSupported`（复用既有 `listening`）。

## 四道质量门

| 门 | 结论 | 证据 |
|---|---|---|
| consistency | **PASSED** | 前端 `tsc --noEmit` 0；e2e `tsc --noEmit` 0；前端 `vitest` 142/142 全绿；无后端改动，全栈契约无需对齐 |
| tests | **PASSED (user-accepted-ci)** | 前端 `vitest` 15/15（speech-dictation 纯逻辑）全绿 + 全量 142/142；i18n 中英键齐备且 parity 校验通过；BDD/E2E `chat-voice.feature` 两场景已就绪，交 CI `e2e` job 验证 |
| review | **PASSED (0 open)** | 见下「对抗式自检」 |
| optimization | **PASSED (0 open)** | 核心逻辑抽到纯模块；无 stub/调试代码；i18n 复用键、增 3 键中英齐备 |

### 对抗式自检（review 门）
- **空安全**：`getSpeechRecognitionCtor` 对 `window` 缺失 / `results` 空 / `transcript` 空均有处理；`onFinalRef.current?.()` 可选链。
- **错误处理**：`rec.onerror` 仅记 warn 不抛；`start()` 抛错落停；`stop()` 未 start 时忽略异常。
- **注入/安全**：无用户输入直插 DOM（React 受控渲染）；无密钥/连接串；`lang` 固定 `en-US`（无注入面）。
- **边界**：非安全上下文 / 无构造器 → `supported=false` 按钮 disabled；interim 不写入 input（发送以 input 为准）；`resultIndex` 增量避免重复累计。
- **死代码/魔法值**：`lang="en-US"` 符合英语对话场景，无硬编码端口/路径；无未用导出。
- **类型契约**：纯前端，沿用既有 `SpeechRecognition` 全局类型声明（不引入 `@types/dom-speech-recognition`）。
- **日志/可观测**：`onerror` / `start` 失败记 `logger.warn`（无敏感泄露）。
- **测试面**：`speech-dictation.ts` 纯逻辑 15 用例全绿；UI 行为由 E2E 覆盖。

## E2E（BDD）说明

- `src/e2e/features/chat-voice.feature` 两场景：
  1. 麦克风可见 → 点击进入 listening → 输入框出现英文文本 → 发送成功（UI 确定性夹具，fake `SpeechRecognition` 投递罐头 final，不依赖真实语音）。
  2. 不支持时（`open({ speechRecognition: false })` 不注入 fake）→ 麦克风按钮 `disabled`。
- **为何交 CI 兜底（user-accepted-ci）**：本机 `next dev` 起不来（用户拒删 `.next`），无法起前端服务实跑 BDD；`chat.ts` 已注入 `fakeSpeechRecognitionScript` + 新增 `setSpeechFinal/isVoiceButtonVisible/isVoiceListening/isVoiceButtonDisabled/inputText` 等 POM 方法与步骤，CI `e2e` job（带前端服务）即可直接验证。依项目护栏，agent 禁止私自自报 `tests:PASSED`，故以 `user-accepted-ci` 标注交 CI 兜底。

## 遗留风险
- 连续说话的 `onend` 自动重启在真实浏览器依赖其静音检测行为；若某浏览器在静音后高频 `onend`，可能频繁重启（已 try/catch 兜底，真实使用场景（孩子持续说话）下无影响）。
- 语言固定 `en-US`，后续如需中英混输再加语言切换（本期不做，设计已声明）。
- E2E 未本地实跑，已如实标注交 CI `e2e` job 验证。
