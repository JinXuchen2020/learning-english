# AI-307 质量门报告

> feature: `feat/ai-307` · `/speech` 页面 · 跟读卡片（听→录→评→反馈→得星）（M3 口语训练）
> 日期: 2026-08-06 · 栈: node-ts（Next.js 14 App Router + NestJS 复用端点）
> 质量门: consistency + tests + review + optimization — 四道全绿（cleared:true）

## 1. 交付物概览

| 文件 | 类型 | 说明 |
|---|---|---|
| `src/lib/speech.ts` | 纯逻辑 | `mapBackendMascotExpr` / `isSpeechSynthesisSupported` / `speakText`（Web Speech API 朗读，node-safe 降级） |
| `src/lib/types.ts` | 类型 | 新增 `SpeechLevel` / `SpeechFeedback` / `EvaluateSpeechOptions`（与 AI-306 后端结构对齐） |
| `src/lib/api.ts` | 接口 | 新增 `evaluateSpeech(file, opts)` + `postFormData`（multipart，复用 `ApiError`） |
| `src/app/speech/page.tsx` | 页面 | `AuthGate` 包裹 + 状态机 + `SpeechCard` / `SpeechFeedbackPanel` / `SpeechComplete` |
| `src/components/TabNav.tsx` | 组件 | 新增 `Speak` 标签 → `/speech`（用户可达 + 供 E2E 客户端导航） |
| `src/components/SpeechRecorder.tsx` | 组件 | 新增 `onReset` 回调（供父组件同步清卡态） |
| `src/lib/speech.spec.ts` | 测试 | 纯逻辑 13 case 全绿 |
| `src/e2e/features/speech-practice.feature` | BDD | 3 scenarios（听→录→评→反馈→得星 全链路） |
| `src/e2e/support/pages/speech.ts` | E2E | `SpeechPage` 页面对象（fake 麦克风注入 + 端点 mock） |
| `src/e2e/step-definitions/speech.steps.ts` | E2E | 步骤定义 |
| `features/ai-307.md` | 设计 | 目标/契约/风险（表情映射、TTS、headless 麦克风、TabNav 路由） |
| `features/backlog.md` | 文档 | AI-307 → done |
| `.quality-gate.json` + 本报告 | 门禁 | 四道门证据 |

## 2. 一致性门（consistency）— PASSED

- `src` frontend `tsc --noEmit`：**0 错误**
- `next build`：**通过**（`/speech` 路由编译，9 个页面全生成，未引入新后端代码）
- `vitest run`：**59/59 全绿**（新增 `speech.spec.ts` 13 case，回归 `speech-recorder.spec` 17 / `api.spec` 11 / `plan.spec` 14 / `logger.spec` 4）
- `e2e`：**16/16 scenarios 全绿**（含 AI-307 新增 `speech-practice.feature` 3 scenarios）
- `typecheck:e2e`：**0 错误**
- 后端：复用 AI-303/306 端点，无新后端代码；既有 `jest` 436 tests **不退化**（前端改动不影响 server 套件）

## 3. 测试门（tests）— PASSED

### 单元测试（vitest，新增 1 文件 13 case + 回归 46 case = 59）

- **`speech.spec.ts`（13 case）**：`mapBackendMascotExpr`（cheer→celebrating、encourage→encouraging、happy/thinking 透传、null/undefined/unknown→happy 降级）全映射；`isSpeechSynthesisSupported`（有 synth→true、无→false）；`speakText`（speak 调用、lang 设置、voice 匹配、voice 不匹配、无 synth→false、抛错→false）全分支
- **回归**：`speech-recorder.spec` 17 / `api.spec` 11 / `plan.spec` 14 / `logger.spec` 4

### BDD / E2E（cucumber + Playwright，3 scenarios 全绿）

- **打开跟读页**：登录新用户 → 打开 `/speech` → 见标题 `Speak with Foxy!` + ≥1 单词卡片 + 听钮
- **听→录→评→得星**：mock 评测通过（score 92, passed, level good, mascotExpr cheer）→ 点听钮 → 录音 → 提交 → 见反馈面板 + `SpeechCelebration` 星动画 + 星计数 = 1
- **弱发音鼓励反馈**：mock 评测失败（score 45, passed false, weak, encourage）→ 录音 → 提交 → 见反馈面板 + **不得星**

### headless 麦克风修复（本轮关键 fix）

- 初次 E2E：`getUserMedia` 抛 `NotAllowedError` → 录音无法进入 `recording` 态 → 2 scenarios 失败
- 根因：`navigator.mediaDevices` 是只读访问器，直接赋值 `getUserMedia` 被**静默丢弃**，真实 `getUserMedia` 在 headless 环境抛权限拒绝
- 修复（双保险）：
  1. `hooks.ts` launch args 加 `--use-fake-device-for-media-stream` + `--use-fake-ui-for-media-stream`（让真实 `getUserMedia`/`MediaRecorder` 在 headless 工作并自动授权）
  2. `speech.ts` `fakeMicrophoneScript` 改用 `Object.defineProperty` 注入 fake `getUserMedia`/`MediaRecorder`（确定性 1KB blob，不依赖物理麦克风）

## 4. 评审门（review）— PASSED

- **契约对齐**：`evaluateSpeech` 字段 `audio/wordId/referenceText/durationMs/userId` 与后端 `EvaluateSpeechDto` 对齐，返回 `SpeechFeedback` 与 AI-306 结构一致
- **表情映射防腐**：`mapBackendMascotExpr` 隔离后端 `happy|encourage|thinking|cheer` 与前端 `happy|thinking|celebrating|encouraging` 差异，未知表情降级 `happy`，不污染 `Mascot` 组件
- **TTS 降级**：Web Speech API 无支持时安全 no-op（不抛、不阻塞听钮）；AI-402 后端 TTS 显式 deferred
- **空安全**：`getAllWords` 失败 → `loadError` 友好提示；`evaluateSpeech` 失败 → `cardError`；均不崩溃
- **不越界**：无新后端实体/端点/依赖（纯前端消费既有 `Word` 与 AI-303 接口）；会话星星数本地 `useState` 不落库（累计/任务联动属 AI-308）；不构建后端 TTS
- **AuthGate 包裹**：token 内存态经 TabNav 客户端导航保活，规避 `page.goto` 重置 token（沿用 AI-207 既定铁律）

## 5. 优化门（optimization）— PASSED

- 纯逻辑 `speech.ts` 全纯函数（node 直覆，零 React 依赖）
- `speakText` 注入式 `synth` + `SpeechSynthesisUtterance` 全局缺失时 node-safe 兜底（`createUtterance` 返回 minimal object）
- 无 stub / 占位（Web Speech 降级是真降级非 TODO）
- 无裸 `console`（统一 `logger`）；无调试残留
- `evaluateSpeech` 复用 `ApiError` 解析且**不复写 JSON `Content-Type`**（fetch 自动带 multipart boundary）
- `SpeechRecorder` 新增 `onReset` 回调，父组件清卡态无冗余状态

## 6. 关键设计决策与边界

- **M3 闭环组装**：本 feature 是 M3 口语链（AI-302 录 / AI-303 评 / AI-306 反馈）的**用户可感知收口**，无新后端逻辑
- **表情契约差异**：后端 `cheer/encourage` 与前端 `celebrating/encouraging` 命名不同，由 `mapBackendMascotExpr` 单一映射点收敛，避免散落 `if`
- **TTS deferred**：AI-402 未落地，朗读用浏览器原生 Web Speech API（儿童设备普遍支持），后续可平滑替换为狐狸音色，不阻塞本 feature
- **星星不落库**：会话内星星为本地 `useState`，累计 / 任务联动（Home mic 任务完成回写）属 **AI-308** 范围，本 feature 显式 deferred
- **headless 麦克风**：launch flags + `Object.defineProperty` 双保险，确保 CI 与本机（Edge）E2E 稳定

## 7. 下一步（M3）

- **AI-308** 口语任务联动（Home mic 任务点击进 `/speech` + 完成后任务勾选/进度回写，消费本 feature 星星结果）
- **AI-309** 句子跟读库（供句子模式；AI-303 当前 `sentenceId`→400 待其落地）
- **AI-402**（可选）后端狐狸音色 TTS 集成，替换 Web Speech API 降级
