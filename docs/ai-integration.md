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
│  │   按能力命名的 provider（Chat/Vision/Stt/Tts/Pronunciation），系统默认 Agnes AI（openai-compatible）... │  │
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
4. **系统 provider 配置入库**: 运行期 AI 调用一律走数据库 `provider_configs` 表的系统默认配置（seed 阶段经 `AGNES_API_KEY` 加密落库 Agnes AI, openai-compatible），不再从 env 读取端点/模型；家长可在家长面板为家庭配置 OpenAI 兼容 provider 覆盖系统默认。无配置时由能力 provider 内部 Mock 安全桩兜底。

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
- 提交: `Button[data-action=generate]`, `validatePlanForm`(lib/plan.ts) 通过前 `disabled` (空表单禁用便于 E2E 断言); 生成中 `data-component=PlanStreaming`(Mascot thinking/happy + 渐进草稿 `data-component=PlanDraftPanel` 显示 token 累积文本 + 取消按钮 `data-action=cancel-stream`)；流末端 `done` 事件 → `data-component=PlanPreview` 渲染 weeks→days→lessons；流 `error` 事件 → `data-component=PlanStreamError` + 重试按钮 `data-action=retry-stream`(非静默、非白屏，与「出错即抛」口径一致)
- 调用: `src/lib/api.ts generatePlanStream(dto, onEvent, signal)` → `POST /api/ai/plan/generate/stream` (text/event-stream SSE, 带 Bearer token 后端忽略); 逐 `data: <JSON>` 帧回调 onEvent(start/token/progress/done/error)，结构化计划只在 `done` 交付(后端末端 extractJson+validatePlan 校验)；取消经 `AbortController` 透传 `signal`；无 `ReadableStream` 环境(极旧)自动退化 `generatePlan` 合成 start→done；类型 `PlanStreamEvent`/`PlanStreamErrorCode` 见 `src/lib/types.ts`
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
    POST /api/ai/plan/generate/stream   (AI-804 流式生成，SSE)
      body: 同 generate（{ childId, ageRange, level, dailyMinutes, interests, weeks, useTemplate? }）
      → 入参校验同 generate（class-validator 拦截 → 400；此时因尚未进入 SSE 直接返回 JSON 错误体）
      → PlanService.generatePlanStream(dto, signal?) 异步生成器，逐事件产出 PlanStreamEvent：
        · {type:'start'} → {type:'progress',phase:'thinking'} → for await 累加 token（{type:'token',text}） → {type:'progress',phase:'writing'}
          → 流结束 extractJson(fullText) + validatePlan(plan-schema.ts)
        · 校验失败 / 截断 / provider 异常 → {type:'error',code:'PLAN_INVALID_JSON'|'PLAN_SCHEMA_INVALID'|'PLAN_TRUNCATED'|'AI_ERROR'|'STREAM_UNSUPPORTED'}（事件通道收尾，不向上抛，SSE 已无法改 HTTP 状态）
        · useTemplate=true → 直接 {type:'start'} → {type:'done',plan:buildFallbackPlan,model:'template'}
        · 选项沿用：extraBody.enable_thinking:false + maxTokens:8000 + timeoutMs:55s（< Vercel 60s，留余量给 JSON 解析/审计）；provider 抛 AiProviderException 映射为对应 error 事件
      → 控制器 `PlanController.generateStream` 以 `text/event-stream` 逐帧 `res.write('data: '+JSON.stringify(ev)+'\n\n')`，收尾 `res.end()`；`req.on('close')` → AbortController.abort() 透传 provider fetch（持续吐帧使 Vercel 连接存活，缓解 504 白屏，但总时长仍须 < 60s）
      · 原非流式 `POST /api/ai/plan/generate` 保留并存（兼容 / 测试 / 无 ReadableStream 兜底）；前端默认走 stream，stream 不可用时回退 generate
  · 持久化与应用（AI-206 已落地）：
    POST /api/ai/plan/save
      body: { childId(uuid), plan(GeneratedPlan) }
      → validatePlan 结构校验(不合法 → 400, 含 errors)；合法 → 落库 study_plans(status='draft') + study_plan_days(cascade)，返回 { id, status:'draft' }
    POST /api/ai/plan/:id/apply
      body: { confirm?(boolean) }
      → 找不到计划 404 { code:'PLAN_NOT_FOUND' }
      → 草稿 → 置 status='applied'、按 dayIndex 从今天起填 study_plan_days.date(UTC YYYY-MM-DD)、按天写入 daily_tasks(带 userId/planDayId/date)，旧任务先清后写(经 planDayId 精准清理)
      → **applyPlan 按 Plan A 拆课(AI-803)**：遍历每天 lessonRefsJson（回退 content），每节生成 1 条 daily_tasks 并写 `courseId`/`lessonId`/`skillType`/`source='plan'`；引用 id 经 `CoursesService.lessonExists/courseExists` 校验，**不存在则降级为无深链通用任务（不抛、不整计划失败，保存期容错）**；某天无任何引用 → 仅 1 条通用任务（source='plan'）；返回 { id, status:'applied', appliedDays, tasksCreated, appliedAt }
    GET /api/ai/plan/status   (AI-209 完成度快照)
      query: childId(uuid)
      → 取该 childId 最近一份 applied 计划(按 updatedAt DESC)，relations 加载 days，统计 isDone 完成度
      → 返回 { hasPlan, totalDays, doneDays, completionRatio, planId?, appliedAt? }
      → 无 applied 计划 → { hasPlan:false, totalDays:0, doneDays:0, completionRatio:0 }（200，前端据此隐藏完成度卡）
      → 沿用计划接口「childId 走 query、不加 JwtAuthGuard」约定
    · save 仅做结构校验(复用 AI-204 validatePlan)；**真实 courseId/lessonId 存在性校验已由 AI-803 在 applyPlan（保存/应用期）落地**（按注入目录 CoursesService 校验，缺失降级无深链）；generatePlan 目录注入（让 AI 产出真实 UUID）亦由 AI-803 经 CoursesService.getCatalog 打通
    · 由已保存计划生成配套课程（AI-801 已落地）：
      POST /api/ai/plan/:id/generate-courses
        body: { wordsPerLesson?(int 3..8, 默认 5) }
        → 找不到计划 404 { code:'PLAN_NOT_FOUND' }
        → 由 StudyPlan（含 days）推导课程规格 CourseSpecSeed（标题/描述来自 day.title 清洗后的主题拼接；
          level 无落库值默认 'a1'；lesson 数 = 计划天数；每节标题来自当日清洗标题）——注意 StudyPlan 实体
          不持久化 level/interests/week theme（AI-203 设计断线），故标题取自 day.title/content（实测可用），已在质量门如实说明
        → AiProvider.chat（system=双语儿科友好 COURSE_FROM_PLAN_SYSTEM_PROMPT，user=含 dayTitles 的
          buildCourseFromPlanUserPrompt；temperature:0.5, maxTokens:4096, enable_thinking:false, timeoutMs:18s, maxAttempts:1）
        → JSON.parse → validateCoursePlan（courses-from-plan.schema.ts）结构校验
        → 不合规则自动重试（≤3 次，附 retryNote）；3 次仍失败降级 buildFallbackCoursePlan（courses-from-plan.template.ts）模板课程 degraded=true
        → CoursesService.createCourseFromPlan(spec) 事务落库 Course+Lessons+Words（Word options 简单数组逗号拼接、
          correctIndex 必填、category 取课程标题前 50 字、color 取课程 color 或 null、illustration 默认 null）
        → 返回 GenerateCoursesResponse { courseId, title, lessonCount, wordCount, degraded, model }
        · degraded=true 表示 AI 不可达/连续 3 次结构校验失败，已落库模板课程（仍可学）；degraded=false 为 AI 真实产出
        · 与 generatePlan「出错即抛」不同：课程生成对写路径采用「重试 + 模板降级」，永不 500（保证「生成配套课程」按钮永远可用）
      · 前端（AI-801 已落地）：src/lib/api.ts generateCoursesForPlan(id, dto?) → POST /api/ai/plan/:id/generate-courses；
        /plan 页 PlanPreview 在「应用此计划」成功后展示「生成配套课程」按钮（data-component=GenerateCoursesBlock,
        data-action=generate-courses）；点击调用接口，成功后 router.push('/course')（课程列表页，路由为 /course 非 /courses）查看新课；
        失败显示错误提示。类型 GenerateCoursesResponse/GenerateCoursesDto 见 src/lib/types.ts
```
- 字段级校验(class-validator)：AI-202 落地（`GeneratePlanDto`）。
- **JSON Schema 校验 + 重试(≤3) + 模板降级**：AI-204 已落地（`server/src/plan/plan-schema.ts` 的 `validatePlan` 递归校验 weeks→days→lessons 结构 + lesson.type/skillType/title/courseId/lessonId 格式，错误聚合；`server/src/plan/plan-template.ts` 的 `buildFallbackPlan` 最小合规兜底计划；`PlanService` 重试循环 + `buildPlanUserPrompt(dto, catalog?, attempt)` 重试附 `retryNote`）。`validatePlan` 仅做结构 + 引用格式校验；**真实 `courseId`/`lessonId` 存在性校验已由 AI-803 在 applyPlan 期经 `CoursesService` 落地（缺失降级无深链），`generatePlan` 目录注入（让 AI 产出真实 UUID）亦由 AI-803 经 `CoursesService.getCatalog` 打通**；`buildStudyPlan` 现把每天 lesson 的 `courseId/lessonId/skillType/title` 序列化进 `StudyPlanDay.lessonRefsJson`（可查询索引列，与 content 全量文本并存）。3 套按 `dailyMinutes` 档位的静态周计划（short/standard/extended，由 `resolveTier` 选档）+ 用户可选模板生成（`useTemplate`）已由 AI-205 实现。
- LLM System Prompt 双语版（避免一天过载、复习间隔、口语+听力+书写交错、严守儿童内容安全）：已由 AI-203 实现为 `server/src/plan/plan-agent.prompt.ts` 的 `PLAN_SYSTEM_PROMPT`（狐狸老师 Fox Teacher 儿科友好人设 + 内容安全红线 + 引用真实 courseId/lessonId 指令）。`buildPlanUserPrompt(dto, catalog?)` 在用户提供课程目录时注入真实 UUID 并要求逐节引用；**目录注入入口已由 AI-803 打通**（`generatePlan` → `PlanService.buildMessages` async 调 `CoursesService.getCatalog()` 构造 `PlanCatalog`，非空时传参触发 `curriculumCatalog` 分支；`getCatalog` 失败 try/catch 降级「无目录」分支不阻断生成）。
- Guardrail(重试/降级)：AI-204（校验失败重试 + 模板降级）/ AI-205（已实现：3 套静态周计划 short/standard/extended + 用户可选 `useTemplate` 模板生成，无 LLM 依赖）。
- 鉴权：本接口按契约 `childId` 由 body 传入，未加 `JwtAuthGuard`；AI-206 apply 接口再补鉴权。

**新增表/字段**（AI-201 已落地）: `study_plans` (计划头: `id`,`userId`(FK→users),`skillType`(vocab/listen/speak/write),`status`(draft/applied/archived,默认 draft),`createdAt`,`updatedAt`)；`study_plan_days` 1:N ( `id`,`planId`(FK→study_plans,级联删除),`dayIndex`,`date`(YYYY-MM-DD,AI-206 应用阶段写入),`skillType`,`title`,`content`(text,AI 生成写入),`isDone`(默认 false),`lessonRefsJson`(text,AI-803 落地：该天 lesson 引用精简索引 `[{skillType,courseId,lessonId,title}]`，与 content 并存，可空向后兼容) )。具体课程/课时关联经 AI-803 落为 `study_plan_days.lessonRefsJson` 索引列 + 前端深链引用，非独立外键。**daily_tasks 扩展（AI-206 + AI-803）**：在原全局任务目录表增可空 `userId`(计划任务归属用户, 全局种子为 NULL) / `planDayId`(varchar, Index, 关联 study_plan_days.id, 用于重应用精准清理) / `date`(varchar(10), 计划日 YYYY-MM-DD, 全局种子为 NULL 即每天可见)；**AI-803 再增**可空 `courseId`(uuid)/`lessonId`(uuid)/`skillType`(varchar(16))/`source`(varchar(16): 计划任务显式 'plan'、全局种子为 NULL 不误标)；`getDailyTasks(userId)` 合并「全局种子(userId IS NULL) + 该用户当日计划任务(userId=该用户 AND date=今天)」实现多租户隔离，避免计划任务泄漏给其他用户，并透传引用列供前端深链。

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

**前端 /chat**（**AI-407 已落地**）
- 入口: TabNav 新增 `Chat` 标签 (MessageCircle 图标, href `/chat`), 已登录孩子可见
- 路由: `src/app/chat/page.tsx` (`"use client"` + `AuthGate` 包裹) → `ChatInner`
- 场景选择卡: 进入即 `getChatScenes()`(`GET /api/ai/chat/scenes`) 拉取, 渲染 `SceneCards`/`SceneCard[data-scene-id]`; 选中场景 → 注入 `openingLine` 作为狐狸开场种子气泡(`ChatBubble[data-role=assistant][data-opening=true]`) + 展示 `SceneVocab` 目标词汇; 前端不硬编码场景内容
- 类微信气泡 UI `ChatThread`/`ChatBubble[data-role][data-opening]`: 用户输入经 `sendChatMessage(dto)`(`POST /api/ai/chat/messages`) → 狐狸回复气泡 + **TTS 自动播**
- TTS 自动播: 纯逻辑 `src/lib/audio.ts` 的 `normalizeTtsUrl`/`playTts`(创建 `Audio`, `autoplay=true`, 自动播放被拒 `.catch` 吞掉); `ChatTtsAudio[data-component]` 语音条 `autoPlay` + 手动 🔊 重播按钮; headless 自动播需 `--autoplay-policy=no-user-gesture-required`(hooks.ts 已加)
- 每条狐狸回复底下"跟读"按钮(ReadAlong): 复用 `SpeechRecorder` 组件 + `evaluateSpeech`(`POST /api/ai/speech/evaluate`), 走与 `/speech` 同套录音→评测→反馈(`ReadAlongFeedback`); 跟读通过星属 **AI-307/AI-408** 口语评测星, 与下方对话星标相互独立
- 输入区 `ChatInput`/`ChatComposer`: `Enter` 发送, 空消息禁用
- **对话星标与鼓励（AI-408 已落地）**: `POST /api/ai/chat/messages` 响应体新增 `stars`/`starAwarded`/`starsUntilNext` 三字段, 前端据此——① 头部 `ChatStarCount[data-component]` 徽标实时显示本会话累计星数(`sessionStars`); ② 当 `starAwarded` 为真时弹出 `ChatStarCelebration[data-component][data-stars]` 吉祥物庆祝横幅(`Mascot expression="celebrating"`), 4 秒后自动消失(`setTimeout`), 可点「Keep chatting!」(`data-action="dismiss-celebration"`) 立即关闭
- **Home 聊天星星卡（AI-408 已落地）**: `src/app/page.tsx` 问候横幅新增 `ChatStars[data-component]` 卡（`MessageCircle` 图标 + 累计数 + "chat" 标签），仅在 `chatStars>0` 时渲染；`load()` 中独立 `await api.getChatStars(user?.id)`（与主数据 `Promise.all` 解耦，失败 `catch` 不阻塞主流程），聚合该用户所有会话累计星，与练习星(`progress.totalStars`)相互独立展示
- **会话历史与续聊（AI-409 已落地）**: `/chat` 顶部新增「My conversations」面板（`ChatSessionList[data-component]`）——`useEffect` 内 `await api.getChatSessions(user?.id)` 拉取摘要列表，渲染 `ChatSessionItem[data-component][data-session-id][data-active]` 项（场景标题 + 最近消息预览 + 星星数 + 消息数），空列表显示 `ChatSessionEmpty` 提示；点项 → `handleResumeSession` 调 `api.getChatSessionMessages(id)` 取历史回显到 thread，并同步 `sessionId/selectedSceneId/sessionStars`，续聊时 `handleSend` 携带 `sessionId` 由后端自动接上上下文（验收「续聊上下文不丢」）；「+ New chat」(`data-action="new-chat"`) → `handleNewChat` 清空会话回到初始态。列表加载/续聊失败均独立 `catch`，不阻塞新对话。
- 关键 `data-component` 钩子(用于 E2E): `ChatPage`/`ChatTitle`/`SceneCards`/`SceneCard`[data-scene-id]/`SceneVocab`/`ChatThread`/`ChatBubble`[data-role][data-opening]/`ChatTtsAudio`/`ChatInput`/`ChatComposer`/`ReadAlongPanel`/`ReadAlongFeedback`/`ChatStarCount`/`ChatStarCelebration`[data-stars]
- 类型见 `src/lib/types.ts` `ChatScene`/`ChatMessage`/`SendChatMessageDto`/`SendChatMessageResponse`(对齐后端 `SceneSummary`/`ChatSendResponse`/`ChatMessageDto`)
- **E2E/BDD**: `src/e2e/features/chat.feature` **7 scenarios / ~58 steps** 全绿(约束 #6 前端功能必做 BDD); 全部后端路由 `page.route` 打桩(场景/回复/安全兜底/评测/stars), 不依赖真实 LLM 与 AI 配额, 稳定无 flake; 多轮对话断言改用「等待第 N 个回复气泡出现」避免 `.first()` 竞态; 新增「AI-408 完成 8 轮得星庆祝」场景用 `mockChatReply(..., {awardOnRound:8})` 第 8 次回复返回 `starAwarded` 触发庆祝 + `I chat for 8 rounds saying` 步骤循环发 8 条; Home 端 `home-dashboard.feature` 新增「聊天星星卡」场景(`mockChatStars(3)` → 断言 `ChatStars[data-component]` 含 3)

**后端**（AI-403 已落地 `ChatModule` 的 `ChatController`）
```
POST /api/ai/chat/messages
  body: { text, sessionId?, sceneId?, userId? }   // text 必填; userId 缺省 anonymous(鉴权 deferred)
  → AiProvider.chat({ system: FOX_PERSONA+场景 framing+基线安全规则, messages: history+new })
  → 落库 ai_chat_sessions / ai_chat_messages（user + assistant 各一条）
  → AiProvider.synthesize(replyText) → ttsUrl(归一: audioUrl 透传 / base64→data URI / 无→null)
  → 返回 { sessionId, messageId, replyText, ttsUrl }
  // 错误: 404 CHAT_SESSION_NOT_FOUND / 429 AI_RATE_LIMITED / 502 AI_GENERATION_FAILED / 503 AI_UNAVAILABLE

GET /api/ai/chat/scenes
  → ChatScenesService.list() 枚举全部场景摘要（不含内部 systemPrompt）
  → 返回 [ { id, title, openingLine, targetVocabulary[] } ]   // 顺序即展示顺序
  // 5 个场景: greeting / zoo / shopping / weather / body
  // 场景内容由 chat-scenes.ts 的 SCENE_PACKAGES 注册表单一数据源维护

GET /api/ai/chat/stars?userId=   （AI-408 新增）
  → ChatService.getStars(userId?) 用 queryBuilder 对 ai_chat_sessions 表
    SELECT COALESCE(SUM(stars),0) WHERE userId = :uid（缺省 anonymous 不匹配任何 userId → 0）
  → 返回 { stars }   // 该用户所有会话累计星星数，供 Home 展示「聊天星星」徽标

GET /api/ai/chat/sessions?userId=   （AI-409 新增）
  → ChatService.listSessions(userId?) 列出该用户全部会话摘要
  → 取 ai_chat_sessions（WHERE userId = :uid）+ 其全部 ai_chat_messages（In(sessionIds)）
  → 纯函数 buildSessionSummaries 按「最近活动」(最后一条 user/assistant 消息时间，无消息用 createdAt) 倒序
  → 每条含 messageCount(仅 user/assistant，排除 system) + lastMessagePreview(截断 80) + stars + createdAt/updatedAt
  → 返回 [ ChatSessionSummary ]   // 供 /chat「我的会话」列表；接 GET .../sessions/:id/messages 取历史

GET /api/ai/chat/sessions/:id/messages?userId=   （AI-409 新增）
  → ChatService.getSessionMessages(id, userId?) 取该会话全部历史消息
  → 按 createdAt 升序，仅 user/assistant（排除 system）；ttsUrl 当前恒 null（历史音频未落库路径，见 chat-sessions.ts）
  → 返回 [ ChatHistoryMessage ]   // 供 /chat 续聊前回显，续聊时携带 sessionId 调 POST .../messages 即可接上上下文
```

- **对话星标逻辑（AI-408 已落地）**: 纯函数 `chat-stars.ts` 的 `computeStars(rounds, prevStars)` 与阈值常量 `CHAT_STAR_ROUNDS = 8` 单一数据源——`stars = floor(rounds / 8)`, `starAwarded = stars > prevStars`, `starsUntilNext` 为距下一颗星的轮数（余数 0 时为 8）。`ChatService.sendMessage` 在 TTS 合成后, 用 `messageRepo.count({where:{sessionId, role:'user'}})` 得到本会话已完成轮数 `rounds`, 调用 `computeStars(rounds, session.stars)`, 当 `starAwarded` 时把新 `stars` 落库 `ai_chat_sessions.stars`(该列 AI-401 已建, 默认 0), 并在响应体带回 `stars/starAwarded/starsUntilNext`; 用 `stars > prevStars` 判定（而非 `rounds % 8 === 0`）避免续聊/重复 send 导致双发星。`getStars` 独立聚合, 与主对话链路解耦。
- 会话状态存 `ai_chat_sessions` / `ai_chat_messages` 表（AI-401 建表）;
- 系统提示由 `chat-system-prompt.ts` 的 `buildChatSystemPrompt(sceneId)` 组装：狐狸人设 + 已知场景 framing（greeting/zoo/shopping/weather/body）+ 基线儿童安全规则。
- 场景包（**AI-405 已落地**）：5 个场景的「情境引导 systemPrompt + 起始语 openingLine + 目标词汇 targetVocabulary」统一维护于 `chat-scenes.ts` 的 `SCENE_PACKAGES` 注册表（单一数据源），由 `ChatScenesService`（Nest 注入 seam）暴露 `GET /api/ai/chat/scenes` 供前端枚举；`chat-system-prompt.ts` 的 `SCENE_PROMPTS` 与 `buildChatSystemPrompt` 均从注册表派生，不再重复维护场景文本。未知/自由对话（sceneId 不在 5 个内）仍走原人设流程，不附加 framing。
- 内容安全双保险（**AI-406 已落地**）：在 `ChatService` 调 LLM **之前**对用户输入做两道闸门——① 关键词黑名单（`chat-safety.config.ts` 的 `SAFETY_BLOCKLIST`，中英文启发式、同步硬闸，归一化子串匹配）；② NVIDIA 内容安全分类器（`NvidiaSafetyClassifier` 调 `NVIDIA_SAFETY_MODEL` 默认 `nvidia/llama-3.1-nemoguard-8b-content-safety`，异步语义兜底）。任一命中 → 返回狐狸吉祥物安全兜底回复（`SAFE_FALLBACK_REPLY`，中英双语温和带离），**不调用 LLM**，响应形状不变。分类器未配置 key / 非 2xx / 异常均 **fail-open 放行**（黑名单仍是硬闸），避免安全服务抖动阻断对话。编排见 `ChatSafetyService.checkUserInput` + `SAFETY_CLASSIFIER_TOKEN` 注入。
- 人设 System Prompt（AI-404 已强化 `FOX_PERSONA`）极度重要，须覆盖 6 维度：面向 **5-10 岁**中国小朋友、只用 **A1 简单词汇**、小朋友说错时**换说法示范而非纠错**、可用**中文确认并英文复述**、**话题守界**（不合适话题温柔带回英语小游戏）、鼓励优先+游戏化；聊天调用 **低温度 0.4** 保证稳定可预期。

### 4. AI 错题与进度分析 (`AiReportModule`)

**前端**
- Home 页底部新增 "今日 AI 小结" 卡片(吉祥物气泡形式)
- 每日学习结束后, 调用 `/api/ai/report/daily` 自动生成
- 包含: 已掌握单词、薄弱单词、明日建议、累计星数

**后端**
```
POST /api/ai/report/daily body: {userId, date}
→ 聚合今日 attempts + speechScores + taskComplete + 真实薄弱单词候选(weakWordCandidates, 来自 WordProgress 当日低正确率)
→ AiProvider.chat({system=ReportAgent( AI-503 精炼: 儿童友好/绝不批评/weakWords 必须取自 weakWordCandidates 禁编造 ), user=statsJSON(含 weakWordCandidates)})
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
@Entity('ai_reports') @Unique(['userId','date']) class AiReport { id, userId, date, summaryText, weakWords(simple-array), suggestionText, isDefault(boolean), createdAt }  // 落地于 server/src/ai/ai-report.entity.ts（AI-501 实体 + AI-502 追加 isDefault 列）
```

---

## 六、AiProvider 抽象(NestJS 风格)

```
server/src/ai/
  ai.module.ts          -- 动态模块; 构造 `AiCapabilityHub`（实现 `AiProvider`）聚合 5 个按能力命名的 provider；AI_PROVIDER_TOKEN 绑定 hub，经 createAuditedProvider 套审计/配额/重试链（AI-714 重构）
  ai-provider.interface.ts
  capability providers/  -- 每个能力独立 provider，内部按能力从 DB 配置加载真实 client 或回退 Mock 安全桩：
    chat.provider.ts / vision.provider.ts / stt.provider.ts / tts.provider.ts   -- 对话 / 视觉 / 语音识别 / 语音合成
    pronunciation.provider.ts   -- 复合能力（Stt + Chat + 相似度兜底），由 AiPronunciationScorerService 编排
    mock-ai-provider.ts         -- 无配置时的确定性安全桩（chat/vision 固定文案、tts 空音频、stt 空文本、pronunciation 0 分说明，均不抛错）
  provider-config/      -- ProviderConfigService：按能力解析生效配置（家长覆盖→系统默认→Mock）、buildProvider 仅 openai-compatible 一种类型
  ai-plan/ ai-speech/ ai-conversation/ ai-report/   -- 业务 module
```

> 历史说明：早期实现以智谱 BigModel（`https://open.bigmodel.cn/api/paas/v4`，GLM-4.7-Flash / GLM-4.6V-Flash）作为首选 provider（AI-102~AI-402）。AI-714 重构后已彻底移除 BigModelProvider 与智谱播种，统一为「按能力命名的 provider + 系统默认 Agnes AI（openai-compatible）」架构；所有端点/模型均由数据库 `provider_configs` 配置驱动，不再硬编码厂商。

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
- `synthesize(text, voice): Promise<AudioResult>` TTS（由 TtsProvider 委托 openai-compatible 配置的 TTS 能力；无配置时返回空音频安全桩，前端以 Web Speech 兜底朗读）

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
| 推理模型响应慢/超时 (Agnes `agnes-2.5-flash` 实测含思考延迟) | HTTP 超时放宽到 ≥60s; `max_tokens` ≥512; 慢响应走异步/loading 态 |
| provider 端点不可达 / key 失效 | 能力 provider 内部捕获异常并回退 Mock 安全桩，业务层据 `degraded` 走降级（模板兜底），不抛错致 UI 崩溃 |
| 发音评测不准 / 无 Azure | 提供"相对评分兜底": 转写文本与目标文本相似度 + LLM 判断 |
| 儿童 API 成本 | 每用户每日 token/调用上限 + 缓存常见 plan 模板 + 结果存储避免重复调用 |
| 隐私合规(COPPA/儿童信息保护) | 家长账户托管儿童账号、不存原始录音(或加密+TTL)、家长可一键删除数据 |
| 录音浏览器兼容性 | Safari/iOS WebView 走 `audio/mp4`,提供降级"你不是按下来说吗"的提示 UI |

---

## 九、下一步

1. ~~确定 AI 厂商选型~~ → 已定: 系统默认 provider 由数据库 `provider_configs` 配置驱动（seed 落库 Agnes AI, openai-compatible, `agnes-2.5-flash`）；家长可在家长面板覆盖。运行期不读 AI env。
2. 从 M1(基建) + M2(学习计划) 开始落地; 开发期无 key 时由能力 provider 内部 Mock 安全桩兜底，应用可启动、UI 不崩。
3. 细化后的 feature 列表见 `features/backlog.md`
