# AI 融入儿童英语学习项目 — 功能设计方案

> 日期: 2026-07-31
> 状态: 待评审
> 适用范围: learning-english (Next.js 前端 + NestJS 后端)

---

## 一、项目现状

| 层 | 技术栈 | 核心模块 |
|---|---|---|
| 前端 | Next.js + shadcn/ui + Tailwind | Home / Course / Practice 三页 + TabNav + 吉祥物狐狸 |
| 后端 | NestJS + TypeORM (SQLite/PG) | auth · users · courses · lessons · words · tasks · progress |
| 数据模型 | `Course`, `Lesson`, `Word`, `DailyTask`, `QuizState` | 静态 mock 数据驱动，缺 AI 环节 |

**现状痛点**: 课程内容靠人工编排;每日任务硬编码;口语仅"听读"无评测反馈;进度数据已有但无分析。

---

## 二、AI 功能清单与优先级

### P0 — 核心交付（首期落地）

| # | 功能 | 一句话目标 | 实现方式 |
|---|---|---|---|
| 1 | **AI 学习计划生成** | 输入孩子水平/年龄/兴趣/每日可用时长 → 输出 N 周个性化课表 | LLM 结构化输出 + 进度数据反馈 |
| 2 | **AI 每日口语训练** | 小孩跟读单词/句子 → AI 评分发音、给反馈、攒星 | 浏览器录音 → STT + 发音评分 API 或 LLM 评估音素 |
| 3 | **AI 对话陪练** | 与狐狸吉祥物主题对话（场景购物/打招呼等），降低开口恐惧 | LLM 人设化对话 + TTS 朗读对方话语 + 录音跟读 |
| 4 | **AI 错题与进度分析** | 每次练习结束 AI 给"今日小结+明日建议" | LLM 读 progress 数据 → 自然语言报告 |

### P1 — 增强（二期）

| # | 功能 | 价值 |
|---|---|---|
| 5 | **AI 单词卡片生成** | 按兴趣动态生成单词例句、配图 prompt、读音 |
| 6 | **家长周报** | AI 生成每周学习总结发邮件/推送 |
| 7 | **AI 难度自适应** | 根据正确率自动调整下一题难度 |

### P2 — 拓展（可选）

- 画像成长系统: 吉祥物随学习进度"升级",由 AI 生成剧情文案
- AI 生成绘本: 学完一个课程后, 按本课单词生成简短故事绘本

---

## 三、技术架构设计

```
┌─────────────────────────────────────────────────────────────┐
│  Tablet UI (Next.js)                                         │
│  ┌────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ 学习计划页 │ │ 口语训练 │ │ 对话陪练 │ │ 进度分析报告 │  │
│  └─────┬──────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘  │
│        │             │            │              │          │
│        └─────────────┴────────────┴──────────────┘          │
│                      │ /api/ai/*                            │
└──────────────────────┼──────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────┐
│  NestJS API                                                  │
│  ┌─────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │ PlanModule  │  │ SpeechModule  │  │ ConversationModule│  │
│  │  (LLM)      │  │ (STT+Rating)  │  │  (LLM+TTS)       │  │
│  └─────┬───────┘  └───────┬───────┘  └────────┬─────────┘  │
│        │                  │                   │             │
│  ┌─────┴──────────────────┴───────────────────┴──────────┐  │
│  │            AiProvider 抽象 (LLM / STT / TTS)           │  │
│  │   智谱 BigModel GLM-4.7-Flash (首选) · NVIDIA · Azure ... │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  现有: Auth · Users · Courses · Lessons · Words · Tasks · Progress │
└──────────────────────────────────────────────────────────────┘
```

### 关键原则

1. **AiProvider 抽象**: 不绑死某家厂商。新建 `ai/ai.provider.ts` 接口, 注入到各 module。便于成本/质量切换、mock 测试。
2. **新增 NestJS modules** (与现有 courses/lessons 等 module 风格一致):
   - `ai-plan` / `ai-speech` / `ai-conversation` / `ai-report`
   - 复用 `progress` module 的数据做反馈
3. **前端新增 3 个页面**(风格沿用 cozy-kids): `/plan`, `/speech`, `/chat`
4. **统一 `.env`**: `AI_PROVIDER` / `BIGMODEL_API_KEY` / `BIGMODEL_BASE_URL` / `BIGMODEL_MODEL`, 复用 NestJS `ConfigModule`。默认 provider = **智谱 BigModel `glm-4.7-flash`** (OpenAI 兼容端点, 已实测可用), 支持 `mock` 模式零成本开发; NVIDIA 作为备选。

---

## 四、各功能详细设计

### 1. AI 学习计划生成 (`AiPlanModule`)

**前端 /plan** (AI-207 向导表单 + AI-208 展示交互均已落地)
- 入口: TabNav 新增 `Plan` 标签 (Sparkles 图标, href `/plan`), 已登录孩子可见
- 路由: `src/app/plan/page.tsx` (`"use client"` + `AuthGate` 包裹), `childId` 取自 `useAuth().user.id` (uuid, 满足 DTO)
- 五组大触控卡片选择器 (常量集中 `src/lib/plan.ts`):
  - 年龄段 `AGE_RANGES`: 5-6 / 6-8 / 8-10 / 10-12
  - 等级 `PLAN_LEVELS`: pre-a1 / a1 / a2
  - 每日时长 `DAILY_MINUTE_OPTIONS`: 10 / 20 / 30 / 45
  - 兴趣 `INTEREST_OPTIONS`: 动物/太空/水果/运动/音乐/恐龙/汽车/颜色 (多选)
  - 周数 `WEEK_OPTIONS`: 1 / 2 / 3 / 4
- 选择器 DOM: `button[data-field=...][data-value=...]`, 选中态 `aria-pressed`; 兴趣多选
- 提交: `Button[data-action=generate]`, `validatePlanForm`(lib/plan.ts) 通过前 `disabled` (空表单禁用便于 E2E 断言); 提交中 `data-component=PlanLoading`(Mascot thinking); 成功 `data-component=PlanPreview` 渲染 weeks→days→lessons
- 调用: `src/lib/api.ts generatePlan(dto)` → `POST /api/ai/plan/generate` (带 Bearer token, 后端忽略); 无 key 环境 MockProvider 降级 `degraded:true` 仍 200, 预览显示 `data-component=PlanDegradedNote`「Foxy 用了一套现成计划」友好提示
- 失败: 接口报错显示错误提示而非白屏
- 纯逻辑模块 `src/lib/plan.ts` (常量 + `validatePlanForm`/`isPlanFormValid` + AI-208 颜色化 `PLAN_SKILL_COLORS`/`planSkillColor`/`planLessonTypeLabel`/`formatPlanDay`) 单测覆盖; 计划类型见 `src/lib/types.ts` (PlanSkillType/PlanLevel/PlanLesson/PlanDay/PlanWeek/GeneratedPlan/GeneratePlanResponse/GeneratePlanDto/SavePlanDto/SavePlanResponse/ApplyPlanDto/ApplyPlanResponse)
- 周计划卡片视图(每天按技能类型颜色化, vocab #F59E0B / listen #3B82F6 / speak #EC4899 / write #10B981) + 「重新生成」(复用 generate, loading+降级提示) + 「应用此计划」(`savePlan`→`applyPlan`→跳 Home 每日任务, 复用 AI-206 apply) + 单日任务本地勾选(前端本地态); 颜色/标签/格式化逻辑集中在 `lib/plan.ts`, 单测覆盖; 调用扩展见 `src/lib/api.ts` `savePlan`/`applyPlan`
- **Home 完成度卡**(AI-209 已落地): `src/app/page.tsx` 加载时除 courses/tasks/progress 外并行拉取 `getPlanStatus(user.id)`(→`GET /api/ai/plan/status?childId=`)，仅当 `hasPlan` 时渲染 `data-component=PlanProgress` 卡片(ProgressRing 环形进度 + 「已完成 X/Y 天」文案); 完成任务后 `handleCompleteTask` 成功后并行刷新 progress + planStatus, 完成度实时递增。后端 `TasksService.completeTask` 注入 `StudyPlanDay` 仓库, 完成任务且该 task 带 `planDayId` 时幂等回写 `study_plan_days.isDone=true`(复用 AI-206 `replacePlanTasks` 按 planDayId 写入的关联); 类型见 `src/lib/types.ts` `PlanStatusResponse`

**后端**（AI-202 已实现）
```
POST /api/ai/plan/generate
body: { childId(uuid), ageRange("lo-hi"), level(pre-a1|a1|a2), dailyMinutes(5-120), interests(string[]非空), weeks(1-4), useTemplate?(boolean 可选, 跳过 LLM 直出内置模板) }
  → 全局 ValidationPipe(class-validator) 拦截非法入参 → 400
  → PlanService 组装 system+user(JSON payload) → AiProvider.chat({temperature:0.4, maxTokens:2048})
  → 剥离 markdown 代码围栏 → JSON.parse → `validatePlan(plan-schema.ts)` 结构+lesson 引用格式校验
  → 合规则返回(attempt=1)；不合规则自动重试(≤3 次, 重试请求附 retryNote 自我纠正)
  → 仍失败降级 `buildFallbackPlan(plan-template.ts)` 三档模板(按 dailyMinutes: short≤15min/2节, standard16-45min/4节, extended≥46min/5节) → degraded=true, model='template'
  → 响应 GeneratePlanResponse { plan, model?, degraded }
     · degraded=true 表示 LLM 连续 3 次输出仍不符合 Schema → 已降级为内置模板计划(plan.weeks 有效可渲染), 仍 200
     · useTemplate=true 表示用户主动选择模板(无 LLM 依赖) → 直接返回三档内置模板, model='template', degraded=false, 仍 200 (AI-205)
     · provider 基础设施异常向上传播(不在本层重试, 避免与 AI-106 HTTP 层退避叠加)
  · 持久化与应用（AI-206 已落地）：
    POST /api/ai/plan/save
      body: { childId(uuid), plan(GeneratedPlan) }
      → validatePlan 结构校验(不合法 → 400, 含 errors)；合法 → 落库 study_plans(status='draft') + study_plan_days(cascade)，返回 { id, status:'draft' }
    POST /api/ai/plan/:id/apply
      body: { confirm?(boolean) }
      → 找不到计划 404 { code:'PLAN_NOT_FOUND' }
      → 草稿 → 置 status='applied'、按 dayIndex 从今天起填 study_plan_days.date(UTC YYYY-MM-DD)、按天写入 daily_tasks(带 userId/planDayId/date)，旧任务先清后写(经 planDayId 精准清理)
      → 已 applied 且 confirm!==true → 409 { code:'PLAN_ALREADY_APPLIED', needsConfirm:true, message }（前端弹确认后带 confirm:true 重应用，覆盖式）
      → 返回 { id, status:'applied', appliedDays, tasksCreated, appliedAt }
    GET /api/ai/plan/status   (AI-209 完成度快照)
      query: childId(uuid)
      → 取该 childId 最近一份 applied 计划(按 updatedAt DESC)，relations 加载 days，统计 isDone 完成度
      → 返回 { hasPlan, totalDays, doneDays, completionRatio, planId?, appliedAt? }
      → 无 applied 计划 → { hasPlan:false, totalDays:0, doneDays:0, completionRatio:0 }（200，前端据此隐藏完成度卡）
      → 沿用计划接口「childId 走 query、不加 JwtAuthGuard」约定
    · save 仅做结构校验(复用 AI-204 validatePlan)，真实 courseId/lessonId 存在性校验需课程目录注入，不在本 feature 范围（属后续目录注入增强）
```
- 字段级校验(class-validator)：AI-202 落地（`GeneratePlanDto`）。
- **JSON Schema 校验 + 重试(≤3) + 模板降级**：AI-204 已落地（`server/src/plan/plan-schema.ts` 的 `validatePlan` 递归校验 weeks→days→lessons 结构 + lesson.type/skillType/title/courseId/lessonId 格式，错误聚合；`server/src/plan/plan-template.ts` 的 `buildFallbackPlan` 最小合规兜底计划；`PlanService` 重试循环 + `buildPlanUserPrompt(dto, catalog?, attempt)` 重试附 `retryNote`）。**注意**：`validatePlan` 仅做结构 + 引用格式校验，真实 `courseId/lessonId` 存在性校验需课程目录注入，属后续增强（AI-206 落地的是持久化/apply，save 仅复用 `validatePlan` 做结构校验，不做 id 存在性校验）；3 套按 `dailyMinutes` 档位的静态周计划（short/standard/extended，由 `resolveTier` 选档）+ 用户可选模板生成（`useTemplate`）已由 AI-205 实现。
- LLM System Prompt 双语版（避免一天过载、复习间隔、口语+听力+书写交错、严守儿童内容安全）：已由 AI-203 实现为 `server/src/plan/plan-agent.prompt.ts` 的 `PLAN_SYSTEM_PROMPT`（狐狸老师 Fox Teacher 儿科友好人设 + 内容安全红线 + 引用真实 courseId/lessonId 指令）。`buildPlanUserPrompt(dto, catalog?)` 在用户提供课程目录时注入真实 UUID 并要求逐节引用（目录注入属 AI-204/AI-206 入口，id 存在性校验属后续目录注入增强，AI-206 不做）。
- Guardrail(重试/降级)：AI-204（校验失败重试 + 模板降级）/ AI-205（已实现：3 套静态周计划 short/standard/extended + 用户可选 `useTemplate` 模板生成，无 LLM 依赖）。
- 鉴权：本接口按契约 `childId` 由 body 传入，未加 `JwtAuthGuard`；AI-206 apply 接口再补鉴权。

**新增表/字段**（AI-201 已落地）: `study_plans` (计划头: `id`,`userId`(FK→users),`skillType`(vocab/listen/speak/write),`status`(draft/applied/archived,默认 draft),`createdAt`,`updatedAt`)；`study_plan_days` 1:N ( `id`,`planId`(FK→study_plans,级联删除),`dayIndex`,`date`(YYYY-MM-DD,AI-206 应用阶段写入),`skillType`,`title`,`content`(text,AI 生成写入),`isDone`(默认 false) )。具体课程/课时关联（`course_id`/`lesson_id`）不在 AI-201 落地（属后续目录注入增强，非 AI-206 范围）。**daily_tasks 扩展（AI-206）**：在原全局任务目录表增可空 `userId`(计划任务归属用户, 全局种子为 NULL) / `planDayId`(varchar, Index, 关联 study_plan_days.id, 用于重应用精准清理) / `date`(varchar(10), 计划日 YYYY-MM-DD, 全局种子为 NULL 即每天可见)；`getDailyTasks(userId)` 合并「全局种子(userId IS NULL) + 该用户当日计划任务(userId=该用户 AND date=今天)」实现多租户隔离，避免计划任务泄漏给其他用户。

### 2. AI 每日口语训练 (`AiSpeechModule`)

**前端 /speech**
- 每日任务里 "mic" 类任务进入此页
- 卡片显示一个单词/一句话 + 吉祥物朗读按钮(TTS)
- 孩子点麦克风录音 → 上传 → AI 评分
- 返回: 分数(0-100)+ 鼓励语 + 不准音素高亮 + 重试
- 通过(≥60)→ 攒星 + 吉祥物庆祝动画

**后端**
```
POST /api/ai/speech/evaluate
multipart: audio (webm/wav), wordId | sentenceId, userId
→ AiProvider.transcribe(audio) → 文本 + 时戳 + 音素
→ 评分算法:
   a) 比对目标文本 (BERTScore 或 编辑距离)
   b) 发音 API (Azure Pronunciation Assessment / Eloquens)
   c) 兜底: 仅 LLM 评估转写文本相似度
→ 返回 {score, readableText, weakPhonemes[], feedback, mascotExpr}
→ progress.recordSpeechAttempt(...) 持久化
```
- 录音用 `MediaRecorder` 采集 webm/opus; 后端用 `multer` 接收。
- 评分策略可配置, 由 `AiProvider` 实现切换。
- 浏览器录音权限需在 `/speech` 页面提示授权。

### 3. AI 对话陪练 (`ChatModule`)

**前端 /chat**
- 场景选择卡("打招呼"/"去动物园"/"买东西"等, 每场景对应系统提示)
- 类微信气泡 UI, 吉祥物语音 TTS 自动播
- 每条用户消息底下"跟读"按钮(同口语训练机制)
- N 轮后自动鼓励并给本次对话"小星星"

**后端**（AI-403 已落地 `ChatModule` 的 `ChatController`）
```
POST /api/ai/chat/messages
  body: { text, sessionId?, sceneId?, userId? }   // text 必填; userId 缺省 anonymous(鉴权 deferred)
  → AiProvider.chat({ system: FOX_PERSONA+场景 framing+基线安全规则, messages: history+new })
  → 落库 ai_chat_sessions / ai_chat_messages（user + assistant 各一条）
  → AiProvider.synthesize(replyText) → ttsUrl(归一: audioUrl 透传 / base64→data URI / 无→null)
  → 返回 { sessionId, messageId, replyText, ttsUrl }
  // 错误: 404 CHAT_SESSION_NOT_FOUND / 429 AI_RATE_LIMITED / 502 AI_GENERATION_FAILED / 503 AI_UNAVAILABLE
```
- 会话状态存 `ai_chat_sessions` / `ai_chat_messages` 表（AI-401 建表）;
- 系统提示由 `chat-system-prompt.ts` 的 `buildChatSystemPrompt(sceneId)` 组装：狐狸人设 + 已知场景 framing（greeting/zoo/shopping/weather/body）+ 基线儿童安全规则。丰富「场景包模板 + 内容安全双保险」属 AI-405/AI-406（本 feature 仅基线）。
- 人设 System Prompt（AI-404 已强化 `FOX_PERSONA`）极度重要，须覆盖 6 维度：面向 **5-10 岁**中国小朋友、只用 **A1 简单词汇**、小朋友说错时**换说法示范而非纠错**、可用**中文确认并英文复述**、**话题守界**（不合适话题温柔带回英语小游戏）、鼓励优先+游戏化；聊天调用 **低温度 0.4** 保证稳定可预期。
- 内容安全: 基线安全规则已内置; 双保险（关键词黑名单 + LLM safety classifier 二次过滤）属 AI-406。

### 4. AI 错题与进度分析 (`AiReportModule`)

**前端**
- Home 页底部新增 "今日 AI 小结" 卡片(吉祥物气泡形式)
- 每日学习结束后, 调用 `/api/ai/report/daily` 自动生成
- 包含: 已掌握单词、薄弱单词、明日建议、累计星数

**后端**
```
POST /api/ai/report/daily body: {userId, date}
→ progress.module 查询今日 attempts + speechScores + taskComplete
→ AiProvider.chat({system=ReportAgent, user=statsJSON})
→ 返回 {summaryText, weakWords[], suggestion, mascotExpr}
→ 持久化到 ai_reports 表, 避免重复生成
```

---

## 五、数据模型增量(与现有风格一致)

```ts
// server/src/entities/ai-study-plan.entity.ts
@Entity() class AiStudyPlan { id, userId, weeksCount, dailyMinutes, interests(JSON), createdAt, status }
@Entity() class AiStudyPlanDay { id, planId, dayIndex, courseId, lessonId, skillType enum, isDone }

@Entity() class AiSpeechAttempt { id, userId, wordId?, sentenceId?, audioPath, score, weakPhonemes(JSON), createdAt }
@Entity() class AiChatSession { id, userId, sceneId, stars, createdAt, updatedAt }
@Entity() class AiChatMessage { id, sessionId, role(user|assistant|system), text, audioPath?, createdAt }
@Entity() class AiReport { id, userId, date, summaryText, weakWords(JSON), suggestionText, createdAt }
```

---

## 六、AiProvider 抽象(NestJS 风格)

```
server/src/ai/
  ai.module.ts          -- 动态模块, 根据 .env 的 AI_PROVIDER 选 provider (bigmodel | nvidia | mock)
  ai-provider.interface.ts
  providers/
    bigmodel.provider.ts      -- 智谱 BigModel (首选, OpenAI 兼容端点, GLM-4.7-Flash)
    nvidia.provider.ts        -- NVIDIA build.nvidia.com (备选, 需账户开通模型推理权限)
    mock.provider.ts          -- 确定性假数据, 开发/测试零成本
    azure.provider.ts         -- 发音评测备选 Azure Pronunciation Assessment
  ai-plan/ ai-speech/ ai-conversation/ ai-report/   -- 业务 module
```

**智谱 BigModel 端点与模型** (OpenAI 兼容):
- Base URL: `https://open.bigmodel.cn/api/paas/v4`
- 默认模型: `glm-4.7-flash` (可经 `BIGMODEL_MODEL` 切换)
- 多模态/OCR 模型: `glm-4.6v-flash` (可经 `BIGMODEL_VISION_MODEL` 切换; 支持 base64 `image_url` 输入, 已实测 200 可用, 可做 OCR/拍照学单词/手写识别)
- 已实测: HTTP 200, `content` 正常输出
- ⚠️ 推理模型特性: 响应先输出 `reasoning_content` 再输出最终 `content`; `max_tokens` 需 ≥512 (否则 content 被截断为空); 含推理延迟较大 (实测 ~19s), HTTP 超时需放宽到 ≥60s; provider 实现只读 `message.content` 作为回复
- ⚠️ 限流: `glm-4.6v-flash` 免费模型频繁返回 429 (code 1305 "访问量过大"), provider 需对 429 做指数退避重试 (纳入 AI-106)

**NVIDIA 端点与模型** (备选, build.nvidia.com, OpenAI 兼容):
- Base URL: `https://integrate.api.nvidia.com/v1`
- 默认模型: `meta/llama-3.3-70b-instruct` (可经 `NVIDIA_MODEL` 切换)
- 内容安全过滤模型: `nvidia/llama-3.1-nemoguard-8b-content-safety` (供 AI-406)
- 已实测: key 可认证 (GET /v1/models 200), 但**模型推理需账户具备模型访问权限**, 否则报 `404 "Function ... Not found for account ..."` 或请求挂起。若遇此错误请在 build.nvidia.com 为该账户开通模型访问/套餐。

接口方法:
- `chat(messages): Promise<string>` 通用文本
- `chatWithImage(prompt, imageBase64, mimeType): Promise<string>` 多模态理解/OCR
- `transcribe(audio): Promise<TranscriptResult>` STT
- `assessPronunciation(audio, referenceText): Promise<ScoreResult>` 发音评测
- `synthesize(text, voice): Promise<AudioResult>` TTS（AI-402 已落地：智谱 GLM-TTS `POST {baseUrl}/audio/speech`，返回 `audioUrl` 或 `audioBase64`，默认狐狸音色 `tongtong`）

**成本/速率**: 每用户每日 token/调用配额已落地（AI-107）：`server/src/ai/` 下 `AiUsage` 实体（`ai_usage` 表，`userId+date` 唯一）+ `AiUsageLimitService`（计数/超限判定）+ `UsageLimitedAiProvider`（最外层 provider 外壳，调用前 `assertWithinQuota`、成功后 `recordUsage`、失败/重试不计费）。超限抛 `AiQuotaExceededError`（HTTP 429 + `degraded`），业务层据 `degraded` 走降级（模板兜底）。配置经 `ConfigService`：`AI_DAILY_CALL_LIMIT`（默认 200）/ `AI_DAILY_TOKEN_LIMIT`（默认 100000）。

**审计日志**（AI-108）：在 provider 链最外层（`Logged`）套审计层，每次调用（成功/失败/被配额拦截）计时后落一条不可变流水到 `ai_call_logs` 表（`AiCallLog` 实体 + `AiCallLogService`）+ 经 LOG-101 结构化 logger 写 `logs/app-*.log`。输入/输出一律**截断摘要**（`requestSnippet`/`responseSnippet` 前 200 字符、`errorMessage` 前 255 + 省略号），多模态只记 `[image:<mime>]`，绝不写儿童原始录音 base64 / 长文本。审计写库 best-effort（失败仅告警、返回 false、不阻断主流程）。最终链：`Logged(UsageLimited(Retryable(inner)))`——审计位于最外层，一次用户请求 = 一条审计（含 AI-106 重试总耗时），不会在 retry 内部重复记。预留 `USER_ID_RESOLVER_TOKEN`（默认 `anonymous`）/ `AI_MODULE_TAG_RESOLVER_TOKEN`（默认 `global`）扩展点，待 AI 控制器接入后按登录用户与业务模块隔离。

---

## 七、分步实施路线(建议)

| 阶段 | 周次 | 内容 | 可独立交付 |
|---|---|---|---|
| M1 基建 | W1 | `AiProvider` 接口 + BigModel provider 实现 + key 配置 + 重试/降级 + 每日配额(AI-107) + AI 调用审计日志(AI-108) | ✓ |
| M2 学习计划 | W2 | `/plan` 页 + AiPlanModule + 数据表 + 复用 `tasks` 模块 | ✓ 可演示 |
| M3 口语训练 | W3-4 | `/speech` 页 +录音+STT+发音评分(先模板评分,TTS 用户原声对照) | ✓ |
| M4 对话陪练 | W5 | `/chat` 页(场景+TTS+跟读) | ✓ |
| M5 进度报告 | W6 | 每日 AI 小结卡 + 周报邮件(可选) | ✓ |
| M6 增强 | W7+ | 自适应、AI 卡片生成、家长 Dashboard | — |

每一阶段都可独立通过 `lsp_diagnostics` + `next build` + 真机演示验收。

---

## 八、风险与对策

| 风险 | 对策 |
|---|---|
| LLM 输出不安全/超龄内容 | System Prompt 限定 + 关键词黑名单 + 内容安全模型 (`nemoguard-8b-content-safety`) 二次过滤 + 低 temperature |
| 推理模型响应慢/超时 (GLM-4.7-Flash 实测 ~19s) | HTTP 超时放宽到 ≥60s; `max_tokens` ≥512; 慢响应走异步/loading 态 |
| NVIDIA 账户无模型推理权限 (404 Function not found) | 已切换智谱 BigModel 为主; NVIDIA 修复后作为备选启用 |
| 发音评测不准 / 无 Azure | 提供"相对评分兜底": 转写文本与目标文本相似度 + LLM 判断 |
| 儿童 API 成本 | 每用户每日 token/调用上限 + 缓存常见 plan 模板 + 结果存储避免重复调用 |
| 隐私合规(COPPA/儿童信息保护) | 家长账户托管儿童账号、不存原始录音(或加密+TTL)、家长可一键删除数据 |
| 录音浏览器兼容性 | Safari/iOS WebView 走 `audio/mp4`,提供降级"你不是按下来说吗"的提示 UI |

---

## 九、下一步

1. ~~确定 AI 厂商选型~~ → 已定: **智谱 BigModel `glm-4.7-flash`** (OpenAI 兼容端点, 已实测 200 可用), 配置已写入 `server/.env`, `AI_PROVIDER=bigmodel`
2. 从 M1(基建) + M2(学习计划) 开始落地; 开发期可用 `AI_PROVIDER=mock` 或真实 bigmodel 推进
3. 细化后的 feature 列表见 `features/backlog.md`
