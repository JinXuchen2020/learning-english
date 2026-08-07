# M3 — AI 每日口语训练 (W3-W4)

> 本里程碑共 **9** 个 feature，均已 `done`。


| ID | Feature | 优先级 | 依赖 |
|---|---|---|---|
| AI-301 | `ai_speech_attempts` 实体 | P0 | — |
| AI-302 | 录音采集组件 | P0 | — |
| AI-303 | 评测接口 `POST /api/ai/speech/evaluate` | P0 | AI-302, AI-106 |
| AI-304 | STT 集成 | P0 | AI-102, AI-303 |
| AI-305 | 发音评分策略 | P0 | AI-304 |
| AI-306 | 评分反馈 | P0 | AI-301, AI-305 |
| AI-307 | `/speech` 页面 — 跟读卡片 | P0 | AI-302, AI-306, AI-402 |
| AI-308 | 口语任务联动 | P0 | AI-307, 现有 TasksModule |
| AI-309 | 句子跟读库 | P1 | AI-306 |

---

## AI-301 — `ai_speech_attempts` 实体

> 优先级 **P0** · 依赖 — · 状态 done

**目标**

为 M3「AI 每日口语训练」落地**数据底座**：建立 `ai_speech_attempts` 表，记录每次跟读尝试的
`userId / wordId / sentenceId / audioPath / score / weakPhonemes / createdAt`；提供
`AiSpeechAttemptService` **最佳努力（best-effort）持久化**与按用户查询，供 AI-303（评测接口）/
AI-306（评分反馈）/ AI-307（跟读卡片）消费。后续 AI-302（录音采集）、AI-305（STT）、AI-309（句库）
将直接复用本 feature 的实体与 `AiModule` 仓库。

**验收标准**

- [ ] `ai_speech_attempts` 表由 `synchronize` 自动建立（`DataSource.initialize` 不抛错，CI seed 同等校验）。
- [ ] `record` 落库成功返回 `true`；`score` 越界被钳制（<0→0, >100→100, 小数→取整）；`weakPhonemes` 空/含空白被清洗。
- [ ] DB 写入失败时 `record` 返回 `false` 且不抛（best-effort）。
- [ ] `findByUser` 按 `createdAt` 倒序返回，`limit` 生效。
- [ ] `nest build` / `tsc` 0 错误；jest 全绿；覆盖率 90/70 基线不退化；pre-commit 质量门强执通过。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（jest + ts-jest，覆盖有逻辑分支的源码）**

- `ai-speech-attempt.service.spec.ts`：fakeRepo 覆盖
  - `record` 成功返回 `true`，字段正确透传（userId/wordId/sentenceId/audioPath/score）；
  - `clampScore` 分支：NaN/Infinity→0、<0→0、>100→100、50.6→51；
  - `sanitizePhonemes`：`null`/`[]`→`[]`、含 `' /'` 空白被 trim+filter；
  - DB 失败 `record` 返回 `false` 且 `logger.warn` 被调用（best-effort，不抛）。
  - `findByUser`：调用 `repo.find` 且 `order: {createdAt:'DESC'}`、`take = limit`。
- `ai-speech-attempt.entity.spec.ts`：in-memory better-sqlite3 + `appEntities` 行为测试
  - save 后读回默认值（`createdAt` 生成、`score` 默认 0、`weakPhonemes` 空数组 round-trip）；
  - `score` 越界经服务层钳制后入库正确；
  - `simple-array` 往返（`['θ','ʃ']` 存读一致）。

**7. 质量门（Phase 4 嵌入）**

- consistency: `nest build`/`tsc` 0 错误；jest 全绿；`synchronize` 建表成功；纯后端无全栈契约。
- tests: 单元测试 2 文件（service.spec + entity.spec）全绿，覆盖 `clampScore`/`sanitizePhonemes`/`record`/`findByUser` 全分支；BDD/E2E 0（纯后端豁免，设计文档显式标注）。
- review: 0 open（空安全/score 钳制/best-effort 吞异常/simple-array 可移植/时间列铁律/无裸 console/与 AiCallLog 风格一致）。
- optimization: 0 open（无 stub/占位；纯函数复用；无临时调试）。


---

## AI-302 — 录音采集组件

> 优先级 **P0** · 依赖 — · 状态 done

**目标**

为 M3「AI 每日口语训练」交付**录音采集**能力：在 `src/components/SpeechRecorder.tsx` 提供可复用的
前端组件，封装 `MediaRecorder` 录音流程（webm/opus 优先、iOS Safari 降级 audio/mp4），支持
**录音时长上限（默认 10s）自动停止**、**麦克风权限引导**与**分级友好错误提示**。所有带分支的
纯逻辑（格式探测、时长钳制、错误分类、结果装配）下沉到 `src/lib/speech-recorder.ts`，由 Vitest
单元测试全覆盖；展示型组件 UI 行为由 AI-307 `/speech` 页的 BDD/E2E 旅程覆盖（见 §6 豁免口径）。

**验收标准**

- [ ] `SpeechRecorder` 在桌面 Chrome / 平板 Safari 均可录音并回调 `onRecordingComplete`（结果含 blob/url/size/durationMs）。
- [ ] 录音达到 `maxDurationMs` 自动停止（时长上限生效）。
- [ ] 拒绝麦克风权限时显示 `permission-denied` 友好提示（含去设置开启的引导）。
- [ ] iOS Safari 走 `audio/mp4` 降级（`isIosFallback=true`）且不崩。
- [ ] `lib/speech-recorder.ts` 全部纯函数单元测试通过；`tsc --noEmit`（前端）0 错误；`next lint` 0 错；Vitest 全绿。
- [ ] pre-commit 质量门强执通过。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（Vitest + ts-jest 等价，node 环境，覆盖有逻辑分支的源码）**

`src/lib/speech-recorder.spec.ts`：
- `classifyRecordingError`：`NotAllowedError`→permission-denied；`SecurityError`→permission-denied；
  `NotFoundError`→no-microphone；`NotSupportedError`→not-supported；message 含 "permission denied"→
  permission-denied；message 含 "microphone"→no-microphone；普通 Error→unknown；非 Error 对象→unknown。
- `pickMimeType`：检测器支持 webm/opus→返回该 mimeType 且 `isIosFallback:false`；仅支持 mp4→
  `audio/mp4` 且 `isIosFallback:true`；全不支持→`{ mimeType:'' }`。
- `clampDuration`：负数→0；NaN→0；>cap→cap；=cap→cap；<cap→原值。
- `isSecureContextForMedia`：无 window→false；`window.isSecureContext=true`→true；`false`→false。
- `buildRecordingResult`：注入 `createObjectURL` stub→url 正确、size=blob.size、durationMs 透传；
  注入返回空串→url='' 不抛；durationMs 负数经 clampDuration→0。

**6. 质量门（Phase 4 嵌入）**

- consistency: `tsc --noEmit`(前端) 0 错误；`next lint` 0 错；Vitest 全绿；`next build` 通过（组件被引用即可编译）。
- tests: 单元测试 `lib/speech-recorder.spec.ts` 全绿，覆盖 classifyRecordingError/pickMimeType/clampDuration/isSecureContextForMedia/buildRecordingResult 全分支；BDD/E2E 0（纯展示组件无独立路由，设计文档显式标注豁免，口语 E2E 旅程随 AI-307 交付）。
- review: 0 open（空安全[getUserMedia 不存在→not-supported]；错误分类覆盖全分支；权限引导文案友好；iOS 降级；URL 释放防泄漏；无裸 console[统一 logger]；与 Button/cn 设计系统一致）。
- optimization: 0 open（无 stub/占位；纯函数复用且导出供单测直覆；无临时调试）。


---

## AI-303 — 评测接口 `POST /api/ai/speech/evaluate`

> 优先级 **P0** · 依赖 AI-302, AI-106 · 状态 done

**目标**

为 M3「AI 每日口语训练」交付**评测入口**：新增 `POST /api/ai/speech/evaluate`，用 multer 接收
前端 `SpeechRecorder`(AI-302) 产出的录音文件 + `wordId`/`sentenceId`（二选一或直传 `referenceText`），
完成**上传校验（大小/格式/时长）**与**评分返回**。校验层是 AI-303 的核心；实际转写/音素级打分的
增强在 AI-304/305，本 feature 仅通过 `AiProvider.assessPronunciation`（AI-101 已定义契约，Mock 已返回
确定性 `ScoreResult`）拿到评分，**不重复实现评分算法、不落库**（落库属 AI-306）。

**验收标准**

- [ ] 合法音频（webm/mp4，≤5MB，≤15s）+ `wordId` → 200 且返回 `ScoreResult`（Mock 下 score=88）。
- [ ] 缺 `audio` → 400 `NO_AUDIO`；空文件 → 400 `EMPTY_AUDIO`。
- [ ] 超 5MB → 413 `AUDIO_TOO_LARGE`；错误 MIME → 415 `UNSUPPORTED_AUDIO_TYPE`；超 15s → 400 `DURATION_EXCEEDED`。
- [ ] `wordId` 不存在 → 404 `WORD_NOT_FOUND`；仅传 `sentenceId` → 400 `SENTENCE_SCORING_NOT_READY`。
- [ ] `tsc --noEmit`(server) 0 错误；`nest build` 通过；`jest` 全绿；覆盖率 90/70 基线不退化。
- [ ] pre-commit 质量门强执通过。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（jest，node + better-sqlite3 不适用，用 fake provider/repo）**

- `speech-evaluate.validation.spec.ts`：`validateSpeechUpload` 全分支（空/超大/坏类型/超时/正常，含自定义 opts）。
- `ai-speech-evaluator.service.spec.ts`：fake `AiProvider`(assessPronunciation 记录入参并返回固定 ScoreResult) +
  fake `WordRepository`(findOne)；覆盖 合法(wordId 解析) / referenceText 直用 / 缺 audio(400) / 空(400) /
  超大(413) / 坏类型(415) / 超时(400) / word 未找到(404) / 仅 sentenceId(400) / 全缺参考(400) /
  provider 入参断言(data.buffer/mimeType/referenceText/passLine)。
- `ai.controller.spec.ts`：fake `AiSpeechEvaluatorService`；调用 `controller.evaluate(file,dto)` 直测
  （绕过 interceptor）；断言 正常返回 ScoreResult；`SpeechEvaluateError` 翻译为 `HttpException(status, {code,message})`。
- 回归：`ai.module.spec.ts` 补 `getRepositoryToken(Word)` 仓库桩（AiModule 现注册了 AiController +
  AiSpeechEvaluatorService，需在编译期提供 Word 仓库），保证 DI 装配测试不破。

**8. 质量门（Phase 4 嵌入）**

- consistency: `tsc --noEmit`(server) 0 错误；`nest build` 通过；`jest` 全绿；`synchronize` 建表成功。
- tests: 单元 3 文件（validation/service/controller）覆盖校验全分支 + 错误码映射；BDD/E2E 0（纯后端 API 豁免，设计文档显式标注）。
- review: 0 open（空安全[缺文件/空 buffer→400]；MIME 白名单；错误码语义清晰；句库未就绪显式 400；不落库边界；无裸 console[统一 logger]；controller 翻译异常）。
- optimization: 0 open（无 stub/占位；纯函数可直覆；MulterOptions 硬上限防滥用；无临时调试）。


---

## AI-304 — STT 集成

> 优先级 **P0** · 依赖 AI-102, AI-303 · 状态 done

**目标**

为 M3「AI 每日口语训练」交付**语音转写（STT）能力编排层**：新增 `AiTranscribeService.transcribe()`，
调用 `provider.transcribe`（经 AI-106 的「重试 + 配额 + 日志」韧性链），并对**降级 / 失败结果做识别标注**
（`degraded` / `degradeReason`），**不抛错**，供下游消费：

- **AI-305**（发音评分策略）：当 `degraded` 为真时走「转写文本相似度（编辑距离）+ LLM 评估」兜底评分。
- **AI-306**（评分反馈）：据 `degraded` / 低置信度给低分（呼应 backlog「静音音频返回低分」）。

本 feature **不实现底层 STT 网络调用**（真实 STT 端点不在本项目能力内，见 §6），只做**调用编排 + 降级识别**；
可测性由 `MockAiProvider.transcribe` 返回确定性 `MOCK_TRANSCRIPT` 保证（验证「清晰发音的单词可被转写」）。

**验收标准**

- [ ] `MockAiProvider` 下 `transcribe()` → 非空 `text`（MOCK_TRANSCRIPT）、`degraded=false`、`confidence=1`（清晰发音可被转写）。
- [ ] `provider.transcribe` 抛错 → 返回降级结果（`degraded:'provider_error'`、空文本）**且不抛异常**。
- [ ] provider 返回空 `text` → `degraded:'empty'`；低置信度（<0.3）→ `degraded:'low_confidence'`。
- [ ] `normalizeTranscript` 正确归一化（小写/去标点/折叠空格）。
- [ ] 服务透传 provider 结果（含 `words`/`durationMs` 轴）供 AI-305 对齐。
- [ ] `tsc --noEmit`(server) 0 错误；`nest build` 通过；`jest` 全绿；覆盖率 90/70 基线不退化。
- [ ] pre-commit 质量门强执通过。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（jest，node，fake provider）**

- `transcribe-result.util.spec.ts`：`normalizeTranscript`（大写→小写 / 标点剥离 / 多空白折叠 / 空串）、
  `classifyTranscript`（空 text→empty / 低置信→low_confidence / 正常 / confidence 缺失不误判）、
  `summarizeTranscript`（合并 degraded + wordCount 计算）。
- `ai-transcribe.service.spec.ts`：fake `AiProvider`（transcribe 记录入参并返回预设 `TranscriptResult`）；覆盖
  成功(带 words 透传, degraded=false) / 空 text(degraded='empty') / 低置信(degraded='low_confidence') /
  provider 抛错(降级 degraded='provider_error' 且**不抛异常**) / provider 入参断言(audio, opts 透传)。
- 回归：`ai.module.spec.ts` **无需改动**（`AiTranscribeService` 仅依赖模块内已注册的 `AI_PROVIDER_TOKEN`，
  编译期 DI 可解析）。

**6. 质量门（Phase 4 嵌入）**

- consistency: `tsc --noEmit`(server) 0 错误；`nest build` 通过；`jest` 全绿；`synchronize` 建表成功。
- tests: 单元 2 文件（util/service）覆盖 normalize/classify/summarize 全分支 + 服务降级全分支；
  BDD/E2E 0（纯后端服务豁免，设计文档显式标注）。
- review: 0 open（空安全；降级不抛错与 AI-102 口径一致；置信度阈值常量化；类型扩展不污染 AI-101 接口；
  不落库边界；无裸 console；异常被捕获标注）。
- optimization: 0 open（无 stub/占位；纯函数可直覆；降级路径零分配开销；无临时调试）。


---

## AI-305 — 发音评分策略

> 优先级 **P0** · 依赖 AI-304 · 状态 done

**目标**

为 M3「AI 每日口语训练」交付**统一发音评分策略编排层**：新增 `AiPronunciationScorerService.score()`，
对一次录音产出**统一 `ScoreResult`**（score ∈ [0,100]），并明确标注实际采用的策略：

- **首选**：`provider.assessPronunciation`（Azure Pronunciation Assessment，phoneme 级打分）。
- **兜底（无 Azure / 首选失败）**：`transcribe` 转写 → **编辑距离相似度** → `provider.chat` LLM 评估 → 综合 `ScoreResult`。

两种策略输出结构一致（`ScoreResult` + 扩展 `strategy`/`degraded`），供 AI-303 评测接口与 AI-306 反馈/落库统一消费。

**验收标准**

- [ ] `auto` + `provider.name==='azure'` + phoneme 成功 → 返回 `strategy:'phoneme'` 且 score 来自 `assessPronunciation`。
- [ ] `auto` + 非 azure（bigmodel/mock/nvidia）→ 走 `similarity`（transcribe + chat），`strategy:'similarity'`。
- [ ] `auto` + azure 但 `assessPronunciation` 抛错 → 降级到 `similarity`（**不抛异常**）。
- [ ] `strategy:'similarity'` 显式 → 跳过 `assessPronunciation`，直接走兜底。
- [ ] transcribe 降级（空文本）→ 相似度 0 → 低分 + `degraded=true` + 友好反馈。
- [ ] LLM chat 返回合法 JSON → 解析出 `weakPhonemes` / `mascotExpr`；chat 抛错 → 走 `buildSimilarityFallbackFeedback`。
- [ ] `AiSpeechEvaluatorService` 委托 scorer：referenceText 解析后调 `scorer.score`（含 audio + referenceText + passLine）。
- [ ] `tsc --noEmit`(server) 0 错误；`nest build` 通过；`jest` 全绿；覆盖率 90/70 基线不退化。
- [ ] pre-commit 质量门强执通过。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（jest，node）**

- `text-similarity.util.spec.ts`：`levenshteinDistance`（相等0/空/全替换/插入/删除）、`similarityRatio`
  （完全匹配=1 / 全错=0 / 部分）、`scoreFromSimilarity`（clamp 0/1 + round）、`selectScoringStrategy`
  （azure→phoneme / bigmodel·mock·nvidia→similarity / 显式覆盖）、`inferMascotExpr`（85/60 边界）、
  `parseLlmAssessment`（JSON 解析 / 弱音素过滤非字符串 / mascotExpr 非枚举忽略 / 非 JSON 全文 / 空串）、
  `buildSimilarityFallbackFeedback`（三档）。
- `ai-pronunciation-scorer.service.spec.ts`：fake `AiProvider`（assessPronunciation 可配 成功/抛错；
  chat 返回预设 JSON 或抛错）+ fake `AiTranscribeService`（transcribe 返回预设 `TranscriptOutcome`）；覆盖
  首选 phoneme 成功 / azure+phoneme 抛错→兜底 / 非 azure→直接 similarity / 显式 similarity 跳过 phoneme /
  transcribe 降级(空)→低分+degraded / chat JSON 解析 / chat 抛错→fallback feedback / scorer 入参断言。
- 回归：`ai-speech-evaluator.service.spec.ts` 改为 **fake `AiPronunciationScorerService`**（验证委托；
  referenceText 解析后调 `scorer.score`，含 audio+referenceText+passLine）；保留 `validateSpeechUpload` 与
  `SENTENCE_SCORING_NOT_READY` / `MISSING_REFERENCE` 分支。`ai.module.spec.ts` 补 `AiPronunciationScorerService` 仓库桩（隔离）。

**6. 质量门（Phase 4 嵌入）**

- consistency: `tsc --noEmit`(server) 0 错误；`nest build` 通过；`jest` 全绿；`synchronize` 建表成功。
- tests: 单元 3 文件（util / scorer / 改后 evaluator）覆盖全分支；BDD/E2E 0（纯后端服务豁免，设计文档显式标注）。
- review: 0 open（空安全；降级不抛错与 AI-102/304 口径一致；策略选择常量化；类型扩展不污染 AI-101 接口；
  不落库边界；无裸 console；异常被捕获标注）。
- optimization: 0 open（纯函数可直覆；Levenshtein 滚动数组 O(min) 空间；无 stub/占位；无临时调试）。


---

## AI-306 — 评分反馈

> 优先级 **P0** · 依赖 AI-301, AI-305 · 状态 done

**目标**

把 AI-305 产出的统一 `ScoreResult` 转化为**面向儿童用户的口语反馈**，并把评分与弱音素**持久化**到
AI-301 的 `ai_speech_attempts` 表，供 AI-307（历史/星级）与 AI-602（难度自适应）消费。

验收标准（来自 backlog）：
- 返回 `score / readableText / weakPhonemes / feedback / mascotExpr`
- 通过线 **60 分**（`passed` 布尔）
- 分数与弱音素**正确入库**（`ai_speech_attempts`）；`weakPhonemes` 可展示（simple-array 往返）

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（server jest）**

- `speech-feedback.util.spec.ts`（纯逻辑全分支）：
  - `buildSpeechFeedback`：passed 边界（60→true, 59→false）；level good/ok/weak 边界
    （80/60）；mascotExpr 优先 `result.mascotExpr` 否则 `inferMascotExpr`；透传字段。
  - `levelFromScore`：<60→weak, 60→ok, 80→good, 100→good, 0→weak。
  - `buildAttemptEntry`：userId 占位（未提供→`anonymous`）、audioPath 占位（未提供→`<inline>`）、
    wordId/sentenceId 透传、weakPhonemes 透传、score 透传。
- `ai-speech-feedback.service.spec.ts`（fake `AiSpeechAttemptService`）：
  - 落库成功 → `record` 被调用一次且返回 `SpeechFeedback`（passed/level 正确）。
  - 落库抛错 → best-effort 不抛 + 仍返回 `SpeechFeedback`（不阻断）。
- 改 `ai-speech-evaluator.service.spec.ts`（fake `AiSpeechFeedbackService`）：
  验证 `evaluate` 委托 feedback（返回 `SpeechFeedback`、feedback 被调用一次、入参
  `userId`/`cmd`/`score` 正确）。


---

## AI-307 — `/speech` 页面 — 跟读卡片

> 优先级 **P0** · 依赖 AI-302, AI-306, AI-402 · 状态 done

**目标**

把 M3 口语链（AI-302 录 / AI-303 评 / AI-306 反馈）组装成**儿童可感知的跟读闭环页面**：
听单词 → 录音跟读 → 提交评分 → 看反馈（分数/弱音素/吉祥物表情）→ 通过得星 + 庆祝动画。

验收标准（来自 backlog）：
- 完整流程：听 → 录 → 评 → 反馈 → 得星；星级动画触发。
- 单词卡片 + 吉祥物朗读按钮 + 录音/重试/提交。
- 反馈正确展示 `score / passed / level / mascotExpr / weakPhonemes / feedback`。
- 通过线 60 分（与 AI-306 `PASS_LINE` 一致）驱动星级/鼓励动画。

**验收标准**

- [ ] `/speech` 经 TabNav 可达；登录后展示 ≥1 张单词卡片（含 Listen 按钮）。
- [ ] 点击 Listen → 调用 `speechSynthesis`（无支持时不崩溃）。
- [ ] 录音（AI-302）→ 提交 → `evaluateSpeech` 返回 `SpeechFeedback` 并渲染分数/等级/映射后的吉祥物表情/弱音素。
- [ ] 通过（score≥60）→ 得星 + 庆祝动画（Mascot `celebrating` + 星 pop）。
- [ ] 未通过 → 鼓励文案 + `encouraging` 表情，不得星。
- [ ] 录音组件错误（权限/不支持）由 `SpeechRecorder` 自身友好提示，不阻塞页面。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（Vitest node，`src/lib/speech.spec.ts`）— 纯逻辑层**

- `mapBackendMascotExpr`：cheer→celebrating / encourage→encouraging / happy→happy / thinking→thinking / 未知字符串→happy / undefined→happy / null→happy。
- `isSpeechSynthesisSupported`：注入 `synth` 时 true；传 undefined（无 window）时 false。
- `speakText`：注入 `synth` 时 `speak` 被调用且入参 `SpeechSynthesisUtterance.text===text`；`lang` 传入时 utterance.lang 正确；无匹配 voice 时仍调用 `speak`；`synth` 缺失时返回 false 且不抛。

**7. 质量门（Phase 4 嵌入）**

- consistency: 前端 typecheck + build + 单测全绿 + E2E 跑通 + MascotExpression 契约映射对齐。
- tests: unit 1 file（speech.spec.ts）+ e2e 2-3 scenarios（speech-practice.feature）。
- review: 空安全（feedback 字段可选）、错误兜底（ApiError 友好提示）、注入安全（无用户输入拼 SQL/HTML）、死代码/魔法值（PASS_LINE 复用 AI-306 常量语义）、契约对齐（前后端 mascotExpr）。
- optimization: 无 stub 占位；Web Speech API 不支持时安全降级；不残留调试代码。


---

## AI-308 — 口语任务联动

> 优先级 **P0** · 依赖 AI-307, 现有 TasksModule · 状态 done

**目标**

把「每日任务」里的**口语类（mic 图标）任务**变成可直达的入口：
- Home 上 mic 任务卡片点击 → 客户端导航到 `/speech?taskId=<id>`；
- 用户在 `/speech` 完成整轮跟读会话（听→录→评→反馈→得星）后，`/speech` 自动调用
  `PATCH /tasks/:id/complete` 把该任务勾选完成，并触发后端已有的「进度回写」（计划任务回写
  `study_plan_days.isDone`；`getProgress` 反映 stars/streak）。
- 验收闭环：**从 Home 任务卡直达口语页 → 完成会话 → 回到 Home，任务显示已勾选**。

headphones / pencil 类任务**保持现状**（点击即 `completeTask`，不导航）。

**验收标准**

- [ ] Home 上 mic 任务卡片点击 → 客户端导航到 `/speech?taskId=<id>`（无整页刷新、不丢 token）。
- [ ] `/speech` 完成整轮会话后，对应每日任务被勾选（`completed=true`），后端进度回写生效。
- [ ] 回到 Home，mic 任务显示 ✔ 且「X/Y done」计数 +1。
- [ ] headphones / pencil 任务一键完成行为不变（回归绿）。
- [ ] 单测 + E2E 全绿；`next build` 通过（Suspense 已包）。
- [ ] 无新后端代码、无新实体。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（Vitest）**

- `src/lib/tasks.spec.ts`：`isSpeakingTask`（mic→true；headphones/pencil→false）、
  `speakingTaskHref`（含 `encodeURIComponent` 与 `taskId=` 前缀）。


---

## AI-309 — 句子跟读库

> 优先级 **P1** · 依赖 AI-306 · 状态 done

**目标**

为 M3「AI 每日口语训练」补齐**句子跟读库**：建立 `Sentence` 实体与预置分级跟读句，
提供可查询接口（`GET /api/sentences`，按 `level` / `wordText` 过滤），并把 AI-303 评测接口里
此前显式返回 400 `SENTENCE_SCORING_NOT_READY` 的 `sentenceId` 路径**打通为可用**——查库取
`Sentence.text` 作参考文本进入评分。同时在前端 `/speech` 页增加**单词 / 句子双模式切换**，
句子模式加载句库、渲染句子卡片并以 `sentenceId` 提交评测。

本 feature 收尾 M3「听→录→评→星」闭环的**句子维度**，使 AI-303 DTO 的 `sentenceId` 三选一
真正落地（此前仅 `wordId` / `referenceText` 可用）。

**验收标准**

- [ ] `GET /api/sentences` 返回种子句（≥30 条），`?level=L1` / `?wordText=cat` 过滤正确。
- [ ] `POST /api/ai/speech/evaluate` 带 `sentenceId`（存在）→ 200 返回 `SpeechFeedback`；
  带不存在 `sentenceId` → 404 `SENTENCE_NOT_FOUND`；原 `SENTENCE_SCORING_NOT_READY` 不再出现。
- [ ] `/speech` 页可切换到句子模式并见句子卡片，录音提交得反馈/星。
- [ ] `tsc --noEmit`(server) 0 错；`nest build` 通过；`jest` 全绿（新增 sentences 单测 + evaluator 回归）；
  前端 `tsc` 0 错 + `vitest` 全绿 + `next build` 通过。
- [ ] E2E 句子库场景（切模式见卡片 / 录音提交得星）全绿；整轮 E2E 全绿。
- [ ] pre-commit 质量门强执通过。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（jest，后端）**

- `sentences.service.spec.ts`：fake repo 覆盖 `findAll`（全量 / level 过滤 / wordText 过滤）
  + `findById`（命中 / 未命中）。
- `sentences.controller.spec.ts`：fake service 覆盖 `GET`（无参 / level / wordText）入参透传与返回。
- `ai-speech-evaluator.service.spec.ts`：构造器补 `sentenceRepo` 第 4 参；
  原「仅 sentenceId → 400 SENTENCE_SCORING_NOT_READY」改为「sentenceId 命中 → 解析 Sentence.text
  评分」（断言 scorer 入参 `referenceText` = sentence.text）；**新增**「sentenceId 未命中 → 404
  SENTENCE_NOT_FOUND」。
- `ai.module.spec.ts`：补 `getRepositoryToken(Sentence)` 桩，保证 DI 装配不破。

**单元测试（vitest，前端，仅纯逻辑）**

- 若抽取 mode→items 派生等可测纯函数（如 `getPracticeItems(mode, words, sentences)` /
  `speechSubmitOptions(mode, item)`），加 `src/lib/speech-practice.spec.ts` 覆盖分支。


---
