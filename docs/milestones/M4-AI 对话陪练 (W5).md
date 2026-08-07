# M4 — AI 对话陪练 (W5)

> 本里程碑共 **9** 个 feature，均已 `done`。


| ID | Feature | 优先级 | 依赖 |
|---|---|---|---|
| AI-401 | `ai_chat_sessions` / `ai_chat_messages` 实体 | P0 | — |
| AI-402 | TTS 集成 | P0 | AI-102 |
| AI-403 | 聊天接口 `POST /api/ai/chat/messages` | P0 | AI-401, AI-402 |
| AI-404 | 狐狸人设 System Prompt | P0 | AI-102 |
| AI-405 | 场景包 | P0 | AI-404 |
| AI-406 | 内容安全双保险 | P0 | AI-403 |
| AI-407 | `/chat` 页面 — 会话 UI | P0 | AI-403, AI-307 |
| AI-408 | 对话星标与鼓励 | P1 | AI-407, AI-401 |
| AI-409 | 会话历史与续聊 | P1 | AI-401, AI-407 |

---

## AI-401 — `ai_chat_sessions` / `ai_chat_messages` 实体

> 优先级 **P0** · 依赖 — · 状态 done

**目标**

为 M4「AI 对话陪练」落地**数据底座**：建立 `ai_chat_sessions`（会话头）与 `ai_chat_messages`（会话消息）两张表，分别承载「某 child 用户的某次场景对话」与「该会话的逐轮消息」。后续 AI-402（TTS）、AI-403（聊天接口）、AI-407（会话 UI）、AI-408（星标）、AI-409（历史续聊）将直接消费本 feature 的实体与 `ChatModule` 仓库。

**验收标准**

- [ ] `ai_chat_sessions` / `ai_chat_messages` 两张表由 `synchronize` 自动建立（本地 `npm run seed` 验证 `DataSource.initialize` 不抛错）。
- [ ] `AiChatSession.stars` 默认 0；`sceneId` 可空。
- [ ] `AiChatMessage.role` 合法值 `user`/`assistant`/`system`（`CHAT_MESSAGE_ROLES` 约束）；`audioPath` 可空；`text` 落地。
- [ ] 实体数由 10 → 12（`entities.metadata.spec.ts` 断言 + 关系回调可调用）。
- [ ] 覆盖率：新增实体被单测覆盖（in-memory DB 行为：建表/默认值/字段落地）；实体无逻辑分支，无遗留未覆盖行为。
- [ ] `nest build` / `tsc` 0 错误；jest 全绿（全局基线不退化）；pre-commit 质量门强执通过。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（实体无逻辑分支，覆盖元数据 + 行为建表证据）**

- `chat.module.spec.ts`（新增）：in-memory better-sqlite3 + 真实 `appEntities` + `ChatModule`：
  - 保存 `AiChatSession`（不显式传 stars/sceneId）→ 读回 `stars === 0`、`sceneId === null`（默认值/可空）。
  - 保存 `AiChatMessage`（含 sessionId/role/text）→ 读回 role/text 落地、`audioPath === null` 默认。
  - 断言 `CHAT_MESSAGE_ROLES` 内容正确（角色枚举完整性）。
  - 断言两表确由 `synchronize` 建立（repository 可 save/find）。
- `entities.metadata.spec.ts`（更新）：导入 `AiChatSession`/`AiChatMessage`，断言实体数 10→12，关系回调可调用。

**7. 质量门（Phase 4 嵌入）**

- consistency: `nest build`/`tsc` 0 错误；jest 全绿；`npm run seed` 建表成功；纯后端无全栈契约。
- tests: 单元测试 2 文件（chat.module 新增 + entities.metadata 更新）全绿；BDD/E2E 0（纯后端豁免，无 legacy 豁免需求——实体无分支逻辑）。
- review: 0 open（空安全/枚举可移植/时间列铁律/非硬外键/无裸 console/与 AI 审计记录口径一致）。
- optimization: 0 open（无 stub/占位；常量数组复用；无临时调试）。


---

## AI-402 — TTS 集成

> 优先级 **P0** · 依赖 AI-102 · 状态 done

**目标**

为 M4「AI 对话陪练」落地**语音合成能力底座**：把 `AiProvider.synthesize(text, voice, options)` 从「降级空结果」升级为**真实调用智谱 GLM-TTS** 并返回可播放音频（`AudioResult`：base64 或托管 URL + mimeType），让狐狸吉祥物获得**一致的儿童友好音色**（系统音色 `tongtong`，可经 `voice` 参数覆盖）。AI-403（聊天接口）会将本 feature 产出的 `ttsUrl`/`audioBase64` 嵌入回复；AI-407（会话 UI）实现「自动播放 / 中断 / 重播」。

**验收标准**

- [ ] `BigModelProvider.synthesize` 向正确端点发送正确请求体（model/input/voice/response_format/speed/volume/stream）。
- [ ] 二进制 mp3 响应 → 返回 `audioBase64` + `mimeType: 'audio/mpeg'`。
- [ ] JSON 信封 `{url}` → `audioUrl`；`{audio}` → `audioBase64`；缺字段 → 抛 502。
- [ ] 缺 `BIGMODEL_API_KEY` → 抛 `AiProviderException`(401)；429 → 限流；网络/超时 → `NETWORK`/504。
- [ ] `readAiConfig` 正确读取 `BIGMODEL_TTS_MODEL` / `BIGMODEL_TTS_VOICE` 并应用默认。
- [ ] `nest build` / `tsc` 0 错误；jest 全绿（全局基线不退化）；pre-commit 质量门强执通过。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（provider 有逻辑分支，覆盖请求构造与响应解析）**

- `bigmodel.provider.spec.ts`（更新）：
  - 改写原「degraded synthesize」用例为**真实路径**：
    - 二进制 mp3 响应 → `audioBase64` 非空 + `mimeType: 'audio/mpeg'`。
    - JSON `{url}` → `audioUrl` 返回、`mimeType: 'audio/mpeg'`。
    - JSON `{audio}` → `audioBase64` 返回。
    - 缺 `audio`/`url` 的 JSON → 抛 502。
    - 缺 key → 抛 401；429 → 限流；网络 reject → `NETWORK`；AbortError → 504。
  - 扩展 `makeResponse` 桩支持 `headers.get` 与 `arrayBuffer`（mock `fetch` Response）。
- `ai-config.spec.ts`（更新）：`toEqual` 断言补 `ttsModel`/`ttsVoice` 默认。
- `mock-ai.provider.spec.ts`（更新）：`synthesize` 返回合法 `AudioResult` 形状（空 `audioBase64` + `audio/mp3`）。

**7. 质量门（Phase 4 嵌入）**

- consistency: `nest build`/`tsc` 0 错误；jest 全绿；无全栈契约（纯 provider 层）。
- tests: 单元测试 3 文件（bigmodel / ai-config / mock 各含 synthesize 相关用例）全绿；BDD/E2E 0（纯后端豁免）。
- review: 0 open（错误分类复用/媒体类型推导/配置断言同步/无裸 console/与现有 provider 风格一致）。
- optimization: 0 open（无 stub/占位；常量复用；无临时调试）。


---

## AI-403 — 聊天接口 `POST /api/ai/chat/messages`

> 优先级 **P0** · 依赖 AI-401, AI-402 · 状态 done

**目标**

为 M4「AI 对话陪练」提供后端聊天接口 `POST /api/ai/chat/messages`：接收宝宝的发言，结合**会话历史 + 场景系统提示（狐狸人设）**调用 LLM 生成回复，落库 `ai_chat_sessions` / `ai_chat_messages`，并用 AI-402 的 TTS 能力产出狐狸音色朗读音频 URL，一并返回。这是 AI-407（`/chat` 前端页面）的数据底座。

用户价值：宝宝在场景里和狐狸吉祥物自然对话，说一句、狐狸回一句并开口朗读，逐步降低开口恐惧。

**验收标准**

- [ ] `POST /api/ai/chat/messages` 新建会话：返回 sessionId/messageId/replyText/ttsUrl，session 与两条 message 落库正确。
- [ ] 续聊：携带既有 sessionId 复用会话，历史消息进入 LLM 上下文，回复连贯。
- [ ] 非法入参（缺 text / text 空 / sceneId 超长 / 额外字段）被 `ValidationPipe` 拒（400）。
- [ ] 续聊不存在的 sessionId → 404 `CHAT_SESSION_NOT_FOUND`。
- [ ] TTS 归一化：audioUrl 透传、base64→data URI、空→null；TTS 失败不阻断文本回复（ttsUrl=null）。
- [ ] LLM 失败映射清晰错误码（429/502/503）；不抛未处理异常。
- [ ] 系统提示含狐狸人设 + 场景 framing（已知场景）+ 基线安全规则；未知/自由场景仅人设+安全。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（覆盖有逻辑分支的源码）**

- `chat-system-prompt.spec.ts`：纯函数 `buildChatSystemPrompt` — 已知场景含对应 framing、未知/null 场景仅人设+安全、安全规则恒在。
- `chat-message.dto.spec.ts`：class-validator 合法/缺 text/空 text/sceneId 超长/额外字段 forbidden。
- `chat.service.spec.ts`：`@nestjs/testing` + mock repo + mock `AI_PROVIDER_TOKEN` — 新建/复用 session、session 不存在→404、历史组装+系统提示注入、user+assistant 落库、ttsUrl 归一化（URL/data URI/空→null）、TTS 失败优雅 null、provider.chat 失败映射（429/503/502）。
- `chat.controller.spec.ts`：响应形状正确；`ChatError`→`HttpException`（含 code）；`ValidationPipe` 拒非法 body。
- 更新 `chat.module.spec.ts`：补 `AI_PROVIDER_TOKEN` mock（模块仍编译 + 建表断言不变）。

**7. 质量门（Phase 4 嵌入）**

- consistency: `nest build` 0 错；`jest` 全绿；无 schema 变更故无 seed 建表需求；纯后端契约，AI-407 前端接入时对齐。
- tests: unit 4 文件（service/controller/dto/system-prompt）+ 更新 chat.module.spec；e2e/bdd 0（纯后端豁免，AI-407 覆盖）。
- review: 0 open；错误分类清晰、TTS 优雅降级、userId 默认一致、非硬外键、无裸 console。
- optimization: 0 open；无 stub；系统提示常量化；响应形状稳定。


---

## AI-404 — 狐狸人设 System Prompt

> 优先级 **P0** · 依赖 AI-102 · 状态 done

**目标**

为 M4「AI 对话陪练」落地**完整、可预期的狐狸吉祥物人设 System Prompt**，使 LLM 回复严格适配 5–10 岁中国小朋友学英语的场景：年龄适配、用词简单、小朋友说错时**换说法示范**而非纠错、可用**中英混说确认**并复述、话题**守界**不越界；同时将聊天调用的 `temperature` 设为**低温度**，保证输出稳定、安全、可预期。这是 AI-405（场景包）与 AI-406（内容安全）的**人设基座**。

用户价值：无论哪个场景，狐狸老师的语气、用词边界、沟通策略都一致且对儿童友好，避免超龄/危险内容、避免挫败式纠错。

**验收标准**

- [ ] `FOX_PERSONA` 含「5 到 10 岁」年龄表述。
- [ ] `FOX_PERSONA` 含 A1 简单词汇约束。
- [ ] `FOX_PERSONA` 含「换一种说法/示范正确说法」的沟通策略（不说错即纠正）。
- [ ] `FOX_PERSONA` 含「可用中文确认 / 英文复述」的中英混说策略。
- [ ] `FOX_PERSONA` 含「话题守界、带回到英语小游戏」的边界策略。
- [ ] `ChatService` 调用 `provider.chat` 时使用低温度（`temperature` 为有限数且 ≤ 0.5）。
- [ ] 既有 `buildChatSystemPrompt` 组装逻辑不变：已知场景含 framing、未知场景仅人设+安全、`BASE_SAFETY_RULE` 恒在。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（覆盖有逻辑分支的源码）**

- `chat-system-prompt.spec.ts`：在既有组装断言之上，**新增 AI-404 维度断言**——`FOX_PERSONA` 包含年龄(5 到 10)、A1 简单词汇、换说法(`换一种`)、中英混说确认(`用一点点中文`)、话题守界(`带回到`)。
- `chat.service.spec.ts`：**新增**低温度断言——`provider.chat` 第二参 `temperature` 为有限数且 `≤ 0.5` 且 `> 0`。
- 既有 `buildChatSystemPrompt` 断言（场景 framing / 未知场景 / 安全恒在）保持通过。

**7. 质量门（Phase 4 嵌入）**

- consistency: `nest build` 0 错；`jest` 全绿；无 schema 变更故无 seed 建表需求。
- tests: unit 2 文件增量断言（system-prompt / service）；e2e/bdd 0（纯后端豁免，AI-407 覆盖）。
- review: 0 open；人设覆盖 6 维度、低温度常量化、未越界 AI-405/AI-406、无裸 console。
- optimization: 0 open；人设常量化、无重复逻辑、响应形状稳定。


---

## AI-405 — 场景包

> 优先级 **P0** · 依赖 AI-404 · 状态 done

**目标**

为对话陪练补齐「场景包」数据模型与服务端枚举能力：5 个儿童英文陪练场景
（打招呼 / 动物园 / 买东西 / 天气 / 身体部位），**每个场景包含三部分**：

1. **System Prompt（情境引导）** —— 注入 LLM 的情境 framing（狐狸人设 `FOX_PERSONA`
   由 `chat-system-prompt.ts` 统一前置，场景包只承载情境引导）。
2. **起始语（openingLine）** —— 进入场景时狐狸的第一句气泡（前端 `/chat` 页
   AI-407 首次问候用）。
3. **目标词汇（targetVocabulary）** —— 本场景 A1 简单词库（前端词库提示 / 跟读候选）。

并提供 **`GET /api/ai/chat/scenes`** 枚举接口，使前端 `/chat` 页（AI-407）能
「枚举 + 选择」场景，拿到每个场景的标题、起始语、目标词汇。

用户价值：把原先散落在 `chat-system-prompt.ts` 的 5 段场景 framing 升级为
「可枚举、含起始语与目标词汇」的结构化场景包，为 AI-407 前端场景卡提供数据契约。

**验收标准**

- [ ] `GET /api/ai/chat/scenes` 返回 5 个场景摘要，id 集合为 greeting/zoo/shopping/weather/body。
- [ ] 每个场景摘要含 title / openingLine / targetVocabulary，且**不含** systemPrompt。
- [ ] 每个场景包 systemPrompt / openingLine / targetVocabulary 均非空（引导词正确、词库非空）。
- [ ] `POST /api/ai/chat/messages` 仍能以已知 sceneId 正确组装系统提示（回归）。
- [ ] 未知 / 自由 sceneId（含 null）仍被 `messages` 接口接受（自由对话兼容）。
- [ ] 单元测试覆盖：注册表完整性、已知/未知场景查找、摘要排除 systemPrompt、枚举端点透传。
- [ ] `nest build` + `npm test` 全绿。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（覆盖有逻辑分支的源码）**

- `chat-scenes.service.spec.ts`：
  - `list()` 返回 5 条摘要，id 集合 == 已知 5 场景；每条摘要**无** systemPrompt 字段。
  - `get('zoo')` 返回完整包（含 systemPrompt）；`get('未知')` 返回 undefined。
  - `exists('greeting')` true；`exists('未知')` false。
  - 注册表不变量：5 个场景 systemPrompt / openingLine / targetVocabulary 均非空；
    与 `SCENE_PROMPTS`（chat-system-prompt 重新导出）一一对应。
- `chat.controller.spec.ts`（扩展）：`@Get('scenes')` 返回 `chatScenes.list()` 结果；
  controller 构造注入 `ChatScenesService` mock。
- `chat-message.dto.spec.ts`（扩展）：未知 sceneId 仍通过校验（自由对话兼容）。

**7. 质量门（Phase 4 嵌入）**

- consistency: `nest build` 0 错；`npm test` 全绿（chat 套件 + 全量回归）；`messages` 接口 sceneId 兼容回归。
- tests: unit 3 文件全绿；e2e/bdd 0（豁免说明）。
- review: 0 open —— 迁移零回归、无裸 console、不越界 AI-406。
- optimization: 0 open —— 场景包常量化、单一数据源（注册表）。


---

## AI-406 — 内容安全双保险

> 优先级 **P0** · 依赖 AI-403 · 状态 done

**目标**

为儿童英文陪练对话（`POST /api/ai/chat/messages`）加一道**内容安全双保险**，在文本送入 LLM 之前拦截不适合 5-10 岁小朋友的内容，命中时返回狐狸吉祥物的**安全兜底回复**（不调用 LLM，不暴露拦截细节）。

双保险 = 两层串联闸门：

1. **关键词黑名单（同步，第一道硬闸）**：命中即拦，零网络开销、必然生效。
2. **NVIDIA 内容安全分类器（异步，语义兜底）**：调用 `nvidia/llama-3.1-nemoguard-8b-content-safety` 把用户文本二分类为 safe/unsafe，兜住黑名单漏掉的语义有害内容（如绕过关键词的隐晦表达）。

**验收标准**

- `nest build` 0 错；`jest` 全绿（含新增 case）。
- 关键词黑名单命中 → 返回狐狸安全兜底回复，不调 LLM。
- NVIDIA 分类器命中 → 同上（有 key 且配置正确时）。
- 正常儿童对话 → 不受影响，走原 LLM 流程。
- 四质量门 PASSED（flat `.quality-gate.json`），pre-commit 放行，提交不 push。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**5. 测试策略（纯后端，E2E 豁免，约束 #6）**

- `chat-safety.classifier.spec.ts`：假 `fetchFn` 覆盖——安全返回 / 不安全返回 / 无 key → fail-open 放行 / 非 2xx → fail-open / 抛错 → fail-open。
- `chat-safety.service.spec.ts`：黑名单命中（含提示词注入词）/ 分类器 mock 命中 / 双安全 / 空文本安全 / 黑名单优先于分类器。
- `chat.service.spec.ts`：注入 mock safety；新增「不安全 → 返回安全兜底且 `provider.chat` 不被调用」；既有 11 case 兼容（默认安全 mock）。


---

## AI-407 — `/chat` 页面 — 会话 UI

> 优先级 **P0** · 依赖 AI-403, AI-307 · 状态 done

**目标**

为 5-10 岁小朋友提供「和狐狸吉祥物练英语对话」的沉浸式页面：
- **场景选择卡**：消费 `GET /api/ai/chat/scenes`，展示 5 个场景（打招呼/动物园/买东西/天气/身体），每张卡含标题 + 起始语 + 目标词汇 chips；选定场景后狐狸先发一句开场白（openingLine）。
- **气泡对话**：类微信气泡 UI，用户发言 vs 狐狸回复分区；发送走 `sendChatMessage({text, sceneId, sessionId?})`，续聊携带 `sessionId` 保持多轮上下文。
- **吉祥物 TTS 语音条**：每条狐狸回复携带 `ttsUrl`（AI-402 狐狸音色 data URI / URL），渲染 `<audio autoPlay>` + 🔊 手动播放按钮，**新回复自动播放**（E2E 加 `--autoplay-policy=no-user-gesture-required`）。
- **每条消息「跟读」按钮**：复用 `SpeechRecorder` 组件做录音，提交经 `evaluateSpeech({referenceText: 该句英文, userId})` 评测，内联展示得分/得星（闭环复用 AI-307/306 管线）。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**6. 测试策略**

- **单元（Vitest，`lib/audio.spec.ts`）**：`normalizeTtsUrl` 三态（data/url/null）、`playTts` 在注入式 stub Audio 下验证 src 赋值/autoplay/play 调用/异常降级。+ `api.spec.ts` 扩展 `getChatScenes`/`sendChatMessage`。
- **E2E（Cucumber + Playwright，`features/chat.feature`）**：
  1. 登录后打开 /chat → 见场景卡 + 输入框。
  2. 选场景 → 狐狸开场白气泡出现 + 目标词汇 chips。
  3. 发消息 → 狐狸回复气泡 + TTS `<audio>` 自动播放（src=ttsUrl）+ 多轮续聊 sessionId 保持。
  4. 跟读：点助手气泡「跟读」→ 录音 → 提交 → 评测反馈（得星/未得星）。
  5. 安全兜底：mock 聊天接口返回安全兜底回复 → 渲染为狐狸气泡。
  - 路由 mock：`**/api/ai/chat/scenes`、`**/api/ai/chat/messages`、`**/api/ai/speech/evaluate`（与 speech E2E 同口径）。
  - 录音走 hooks.ts 的 fake-device flags + `addInitScript` 注入（复用 speech POM 的 `fakeMicrophoneScript`）。


---

## AI-408 — 对话星标与鼓励

> 优先级 **P1** · 依赖 AI-407, AI-401 · 状态 done

**目标**

为 5-10 岁孩子在「和狐狸练英语对话」时提供即时正反馈闭环：
- **完成 N 轮对话得一颗星**：后端按本会话已完成轮数（用户发言条数）计算星数，跨过阈值（默认 8 轮）时 `starAwarded=true`，并把累计星数落库 `ai_chat_sessions.stars`。
- **会话内即时庆祝**：前端收到 `starAwarded` 时弹出吉祥物庆祝横幅（`Mascot` celebrating），4 秒后自动消失，可手动关闭；头部常驻「本会话累计星数」徽标。
- **Home 聚合展示**：`/`（Home）问候横幅独立拉取该用户所有会话累计星数，渲染「聊天星星」卡（与练习星相互独立）。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**7. 测试策略**

- **后端单元（Jest）**
  - `chat-stars.spec.ts`：11 case 覆盖 `computeStars` 边界（0/7→0 星、8/9→1 星、15→1 星、16→2 星、负/浮点安全、余数→`starsUntilNext`、默认阈值 8、`prevStars` 已领先时不再发星）。
  - `chat.service.spec.ts`：7 case（`sendMessage` 8 轮得星 / 7 轮不得星 / 从 1 星续聊 16 轮得第 2 星 / count 异常安全回退 / `getStars` 聚合 / 默认 anonymous / 无会话→0）。
  - `chat.controller.spec.ts`：2 case（`GET /stars` 透传 `userId` / 缺省透传 `undefined`）。
- **前端单元（Vitest）**
  - `lib/api.spec.ts`：2 case（`getChatStars` 带 `userId` 查询串 / 缺省无查询串）。
- **E2E（Cucumber + Playwright，`features/chat.feature` + `features/home-dashboard.feature`）**
  1. *chat.feature* 新增「完成 8 轮得星庆祝」：mock `the chat reply ... and awards a star on round 8`（`mockChatReply(...,{awardOnRound:8, starStars:1, starsUntilNext:8})`），`I chat for 8 rounds saying "hello foxy"` 循环发 8 条 → 断言 `ChatStarCelebration` 可见 + `ChatStarCount` 文本为 `1`。
  2. *home-dashboard.feature* 新增「聊天星星卡」：`the chat stars endpoint returns 3 stars`（`mockChatStars(3)`）置于登录前 → 断言 `ChatStars` 含 `3`。
  - 路由 mock：`**/api/ai/chat/scenes`、`**/api/ai/chat/messages`、`**/api/ai/chat/stars**`、`**/api/ai/speech/evaluate`；全部打桩，不依赖真实 LLM 与 AI 配额，稳定无 flake。
  - 录音走 hooks.ts 的 fake-device flags（复用 speech/chat POM 的 `fakeMicrophoneScript`）。


---

## AI-409 — 会话历史与续聊

> 优先级 **P1** · 依赖 AI-401, AI-407 · 状态 done

**目标**

为 5-10 岁孩子提供「对话陪练」的连续性体验：
- **我的会话列表**：进入 `/chat` 即拉取该用户全部历史会话摘要（场景、最近消息预览、星星数、消息数），按最近活动倒序。
- **恢复历史**：点任意会话 → 回显其全部历史消息到对话 thread，狐狸与孩子的发言完整呈现。
- **续聊不丢上下文**：恢复后继续发言，`sendMessage` 携带 `sessionId`，后端自动从该会话历史重建 LLM 上下文（AI-403 既有能力），保证「续聊上下文不丢」。
- **开新对话**：随时「+ New chat」清空当前会话，回到初始态发起新对话。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**7. 测试策略**

- **后端单元（Jest）**
  - `chat-sessions.spec.ts`：7 case（`buildSessionSummaries` 空/无消息/按活动倒序/仅统计 user+assistant 并排除 system/预览截断 80/无 updatedAt 仍按消息时间排序；`toHistoryMessage` user/assistant/system 兜底/audioPath→ttsUrl null）。
  - `chat.service.spec.ts`：6 case（`listSessions` 按活动倒序 / 空→[] / 按 userId 过滤 / 仅统计 user+assistant 且预览取最后可回显消息+带星星 / `getSessionMessages` user+assistant 升序排除 system 且 ttsUrl 全 null / 透传 id+userId）。
  - `chat.controller.spec.ts`：3 case（`GET sessions` 透传 userId / `GET sessions/:id/messages` 透传 id+userId / 缺省 userId→undefined）。
- **前端单元（Vitest）**
  - `lib/api.spec.ts`：4 case（`getChatSessions` 带/缺 userId 查询串；`getChatSessionMessages` 带/缺 userId 查询串）。
- **E2E（Cucumber + Playwright，`features/chat.feature`）**
  1. 「恢复历史会话查看历史」（AI-409）：mock `the chat sessions endpoint returns a session "sess-old" in scene "greeting" with 2 stars` + `the chat session "sess-old" has history: the user said ... and the fox said ...` → 断言 `I should see 1 chat session item`；`I resume the chat session "sess-old"` → 断言 `I should see a chat bubble containing "How are you today?"` 与 `"I am happy!"`。
  2. 「从历史开新对话」（AI-409）：mock 1 session → 断言 1 item → `I start a new chat` → 断言 `I should see an empty chat thread`。
  3. 「续聊继续对话且历史不丢」（AI-409）：mock 历史 + `the chat reply will be ... with a fox voice` → resume → 断言历史仍在 → 发新消息 → 断言历史气泡与新回复气泡共存。
  - 路由 mock：`**/api/ai/chat/scenes`、`**/api/ai/chat/messages`(回显请求 sessionId)、新增 `**/api/ai/chat/sessions` 与 `**/api/ai/chat/sessions/:id/messages`；全部打桩，不依赖真实 LLM 与 AI 配额，稳定无 flake。
  - 录音走 hooks.ts 的 fake-device flags（复用 speech/chat POM 的 `fakeMicrophoneScript`）。


---
