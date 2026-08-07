# AI 集成功能 Backlog

> 来源: `docs/ai-integration.md`
> 更新: 2026-08-07
> 说明: 按实施阶段(M1-M6)细分为可独立验收的 feature。每个 feature 有唯一 ID、优先级、依赖、验收标准。

## 状态图例

| 状态 | 含义 |
|---|---|
| `backlog` | 已规划, 未开始 |
| `in-progress` | 开发中 |
| `done` | 已交付验收 |
| `blocked` | 被依赖项阻塞 |

## 优先级图例

- **P0**: 核心交付, 首期必做
- **P1**: 增强, 二期
- **P2**: 可选/拓展

---

## 置顶 — 测试与日志基建 (优先于所有 AI 功能)

> 说明: 三项独立于 AI 里程碑, 属质量基线, 置顶优先。TEST-101 覆盖现有已实现代码的单元测试(后端全量); TEST-102 以 BDD 场景描述端到端用户旅程 (BDD ≡ E2E), 不为纯后端 API 单点设计 BDD; LOG-101 统一日志基建 (Logger + 日志文件), 让前后端错误可检索。**前端测试口径(2026-08-03 修订)**: 新 feature 前端 E2E 必做; 前端仅纯逻辑模块(`lib/api.ts`/hooks/带分支工具函数)需单测, 纯展示型组件/页面不强制(由 E2E 覆盖)。
> **项目约定（硬约束）**: 今后每个新 feature 必须自带 BDD/E2E (`*.feature`, 必做, 含前端 UI 行为) + 单元测试(覆盖有逻辑分支的源码: 后端 services/controllers/providers/guards/pipes/工具函数; 前端仅纯逻辑模块, **纯展示型组件/页面不强制**), 并纳入质量门禁——`.quality-gate.json` 须含 `gates.tests` 且 `PASSED`, 否则 pre-commit 拦截; 历史功能由 TEST-101/TEST-102 统筹补齐 (设计文档可标注 legacy 豁免)。

| ID | Feature | 优先级 | 依赖 | 状态 | 验收标准 |
|---|---|---|---|---|---|
| TEST-101 | **现有功能单元测试全覆盖** — 为 `server/src` 下所有已实现模块 (entities / modules / providers / guards / pipes / 工具函数) 补齐 `*.spec.ts`; 用 Jest + `@nestjs/testing` 建测试脚手架; 可注入替换 MockProvider / ConfigModule; 覆盖正常路径 + 边界 + 异常分支 | P0 | — | done | `npm run test` (jest) 全绿; 核心逻辑分支覆盖 (provider 重试/降级/异常映射、class-validator DTO、实体关联); 生成覆盖率报告 (statement ≥ 70%, 核心 ≥ 80%) |
| TEST-102 | **BDD 驱动 E2E 测试** — 用 BDD 场景 (Gherkin `.feature`) 描述端到端用户旅程 (注册/登录 → 生成学习计划 → 跟读口语训练 → 查看每日 AI 小结), 以 BDD 框架 (如 `@cucumber/cucumber`) + E2E 驱动 (如 Playwright) 串联真实/模拟前后端; ⚠️ **不为纯后端 API 设计 BDD** (禁止 "Given API key / When POST /api/... / Then 200" 这类 API 级场景), BDD 仅面向用户可感知的端到端流程 | P0 | — | done | 4 features / 6 scenarios / 27 steps 全绿 (浏览器复用本机 Edge, 免 Chromium 下载); 覆盖现有 4 页面核心旅程; plan/speech/report 旅程留待对应 feature 建页时自带 |
| LOG-101 | **统一日志基建 (Logger + 日志文件)** — 移除应用代码生产路径中的裸 `console.error/console.log/...` 调用, 统一接入 Logger; 后端 `Logger` 写入 `server/logs/app-YYYY-MM-DD.log` (级别 error/warn/info/debug, 异步 append + 镜像 console), 并提供 `POST /api/log` 接口接收前端日志、汇总进同一文件; 前端 `Logger` 封装 console 并 best-effort `POST ${API_BASE}/log`; **约定: 之后所有新 feature 仅允许用 Logger (禁用裸 console)**; 顺带修复 `src/lib/api.ts` 的 `let body: any = null` 为精确类型; E2E 测试夹具 (`src/e2e/**`) 的 console 输出属测试基础设施, 不在本次范围 | P0 | — | done | 应用生产代码 (`src/app`、`src/lib`、`server/src` 除 `seed.ts`/`main.ts` 启动横幅) 无裸 console.*; 后端日志文件可检索且含前端转发的错误; jest 单测覆盖 Logger 纯函数 (serializeMeta/formatLine/文件写入/级别过滤) ≥90%; 前端 Logger 有单测 (fetch 失败静默不抛); 通过 CI 四门 + 质量门 (E2E console 沿用测试豁免) |

---

## M1 — AI 基建 (W1)

| ID | Feature | 优先级 | 依赖 | 状态 | 验收标准 |
|---|---|---|---|---|---|
| AI-101 | **AiProvider 接口定义** — 新建 `server/src/ai/ai-provider.interface.ts`, 定义 `chat / transcribe / assessPronunciation / synthesize` 四个方法签名及 `TranscriptResult / ScoreResult / ChatResult` 类型 | P0 | — | done | TS strict 编译通过; 接口有 JSDoc; 类型覆盖 LLM/STT/TTS/发音评测 |
| AI-102 | **BigModel provider 实现** — `bigmodel.provider.ts` 实现接口: chat 走智谱 OpenAI 兼容端点 `https://open.bigmodel.cn/api/paas/v4/chat/completions` (Bearer key); 模型经 `BIGMODEL_MODEL` 配置 (默认 `glm-4.7-flash`); ⚠️ 推理模型: 响应含 `reasoning_content`+`content`, provider 只读 `content`, `max_tokens` ≥512, 超时 ≥60s; `chatWithImage` 走 `BIGMODEL_VISION_MODEL` (默认 `glm-4.6v-flash`, base64 image_url 输入); STT/TTS 待评估, 暂用 mock/降级 | P0 | AI-101 | done | 真实 key 下跑通一次 chat 并返回 content; 多模态/OCR 调用返回文本; 无效 key 返回清晰错误 |
| AI-103 | **AiModule 动态装配** — `ai.module.ts` 按 `.env` 的 `AI_PROVIDER` 值注册对应 provider (`bigmodel` \| `nvidia` \| `mock`), 未配置时注册 MockProvider | P0 | AI-102 | done | 无 key 时应用可启动; provider 切换只改 env 一处 |
| AI-104 | **MockProvider** — 返回确定性假数据的 provider (固定 plan/报告文本、假评分), 供开发与测试 | P0 | AI-101 | done | 无 key 时前端可跑通全流程演示 |
| AI-105 | **配置与密钥管理** — `.env.example` 增加 `AI_PROVIDER/NVIDIA_API_KEY/NVIDIA_BASE_URL/NVIDIA_MODEL/NVIDIA_SAFETY_MODEL`, 接入现有 `ConfigModule`, 缺失时启动告警; `.env` 不入 git | P0 | AI-103 | done | 缺 key 启动打印 warning; key 不进入 git |
| AI-106 | **重试与降级** — provider 调用封装 3 次指数退避重试; 超时(默认 60s, 推理模型); 429 限流 (code 1305) 视为瞬时错误, 退避重试 + 降低并发; 失败抛 `AiProviderException` 并由业务层降级; NVIDIA 端 `404 Function not found for account` / 挂起错误需识别并映射为 `AiAccessError` 提示账户权限问题 | P0 | AI-103 | done | 模拟 5xx/429 自动重试; 连续失败抛可识别异常; 权限错误给出明确文案 |
| AI-107 | **每日 token/调用配额** — `server/src/ai/` 下 `AiUsage` 实体 + `AiUsageLimitService` + `UsageLimitedAiProvider` 外壳, 每用户每日调用次数/token 用量持久化到 `ai_usage` 表, 超限返回 429 + 降级标记 | P1 | AI-106 | done | 配小额配额可触发 429; 配额数据持久化到 `ai_usage` 表 |
| AI-108 | **AI 调用日志** — 新增 `LoggedAiProvider` 最外层外壳 + `AiCallLog` 实体(`ai_call_logs` 表) + `AiCallLogService`, 每次 LLM 调用(用户/模块/token/耗时/结果截断) 经 LOG-101 结构化日志 + 落表, 便于排查与成本审计 | P1 | AI-106, LOG-101 | done | 每次调用有可检索日志(文件+表); 敏感内容截断 |

---

## M2 — AI 学习计划生成 (W2)

| ID | Feature | 优先级 | 依赖 | 状态 | 验收标准 |
|---|---|---|---|---|---|
| AI-201 | **`study_plans` / `study_plan_days` 实体** — 建表, 与 User 关联, `skill_type` 枚举 (vocab/listen/speak/write), status (draft/applied/archived) | P0 | — | done | TypeORM 迁移/同步建表; 与现有 entities 风格一致 |
| AI-202 | **生成接口 `POST /api/ai/plan/generate`** — DTO (childId, ageRange, level, dailyMinutes, interests, weeks); 调用 AiProvider.chat; 返回结构化 Plan | P0 | AI-106, AI-201 | done | 合法入参返回 plan JSON; 非法入参被 class-validator 拦截返回 400 |
| AI-203 | **PlanAgent System Prompt** — 中文/英文双语儿科友好提示词: 每天 1 主课+2 复习+1 口语、间隔复习、技能交错、内容安全红线; 低 temperature | P0 | AI-102 | done | 输出课程引用真实 course/lesson id; 无超龄/危险内容 |
| AI-204 | **Plan JSON Schema 校验与重试** — 校验 LLM 输出结构与 lesson 引用有效性; 失败自动重试(≤3次); 仍失败降级到内置模板计划 | P0 | AI-202, AI-203 | done | 构造坏 JSON 时自动重试; 3 次后返回模板计划并标记 degraded |
| AI-205 | **内置模板计划** — 3 套静态周计划 (按 dailyMinutes 档位), 用于降级 | P0 | AI-201 | done | 无 LLM 时可选模板生成计划 |
| AI-206 | **计划持久化与"应用计划"** — `POST /api/ai/plan/:id/apply` 将计划落库为 applied, 并按天写入现有 `tasks` 表 | P0 | AI-201, 现有 TasksModule | done | 应用后每日任务列表出现对应任务; 重复应用提示确认 |
| AI-207 | **`/plan` 页面 — 向导表单** — 年龄段/等级/每日时长/兴趣/周数选择器, 大触控目标, 沿用 cozy-kids 风格, 狐狸吉祥物引导 | P0 | AI-202 | done | 表单校验完整; 提交调 generate 接口 |
| AI-208 | **`/plan` 页面 — 计划展示与交互** — 周计划卡片视图 (每日颜色化), "重新生成"、"应用此计划"、单日任务勾选 | P0 | AI-206, AI-207 | done | 应用后跳转 Home 并看到新任务; 重新生成有 loading/降级提示 |
| AI-209 | **计划进度回写** — 完成计划内任务时回写 planDay.isDone, Home 展示计划完成度 | P1 | AI-206, 现有 ProgressModule | done | 完成任务后计划完成度同步更新; Home PlanProgress 卡片显示已完成 X/Y 天 |

---

## M3 — AI 每日口语训练 (W3-W4)

| ID | Feature | 优先级 | 依赖 | 状态 | 验收标准 |
|---|---|---|---|---|---|
| AI-301 | **`ai_speech_attempts` 实体** — 记录 userId/wordId/sentenceId/audioPath/score/weakPhonemes/createdAt | P0 | — | done | 建表; 与现有 entities 风格一致 |
| AI-302 | **录音采集组件** — 前端 `SpeechRecorder` (MediaRecorder → webm/opus), 录音时长上限(如 10s), 权限引导与错误提示; iOS 降级 audio/mp4 | P0 | — | done | 平板 Safari/Chrome 均可录音; 拒绝权限时给出友好提示 |
| AI-303 | **评测接口 `POST /api/ai/speech/evaluate`** — multer 接收 audio + wordId/sentenceId; 校验大小/格式/时长 | P0 | AI-302, AI-106 | done | 合法音频返回评分; 超大/空音频返回 4xx |
| AI-304 | **STT 集成** — `transcribe(audio)` 转写文本+时戳; 失败时走降级 | P0 | AI-102, AI-303 | done | 清晰发音的单词可被转写; 静音音频返回低分 |
| AI-305 | **发音评分策略** — 首选 Azure Pronunciation Assessment (phoneme 级); 无 Azure 时用"转写文本相似度 (编辑距离) + LLM 评估"兜底 | P0 | AI-304 | done | 两种策略输出统一 `ScoreResult`; 分数 ∈ [0,100] |
| AI-306 | **评分反馈** — 返回 score/readableText/weakPhonemes/feedback/mascotExpr; 通过线 60 分; 分数与弱音素持久化 | P0 | AI-301, AI-305 | done | 分数正确入库; weakPhonemes 可展示 |
| AI-307 | **`/speech` 页面 — 跟读卡片** — 单词/句子卡片 + 吉祥物 TTS 朗读按钮 + 录音/重试/提交; 完成后攒星 + 庆祝动画 | P0 | AI-302, AI-306, AI-402 | done | 完整流程: 听→录→评→反馈→得星; 星级动画触发 |
| AI-308 | **口语任务联动** — 每日任务中 mic 类任务点击进入 `/speech`; 完成后任务勾选+进度回写 | P0 | AI-307, 现有 TasksModule | done | 从 Home 任务卡直达口语页; 完成后任务状态更新 |
| AI-309 | **句子跟读库** — 预置 30-50 句分级跟读句 (P0 单词覆盖); 供句子模式使用 | P1 | AI-306 | done | 句库可查询; 与课程词汇关联 |

---

## M4 — AI 对话陪练 (W5)

| ID | Feature | 优先级 | 依赖 | 状态 | 验收标准 |
|---|---|---|---|---|---|
| AI-401 | **`ai_chat_sessions` / `ai_chat_messages` 实体** — session (userId/sceneId/stars), message (role/text/audioPath) | P0 | — | done | 建表; 关联 User（userId varchar 引用，与 AI-301 审计记录口径一致） |
| AI-402 | **TTS 集成** — `synthesize(text, voice)` 生成音频, 返回 URL 或 base64; 前端自动播放 | P0 | AI-102 | done | 狐狸音色发音自然; 播放可中断/重播 |
| AI-403 | **聊天接口 `POST /api/ai/chat/messages`** — 接收 sessionId/sceneId/text; 组装历史+场景 prompt; 返回 replyText + ttsUrl | P0 | AI-401, AI-402 | done | 多轮上下文保持; 回复落库 |
| AI-404 | **狐狸人设 System Prompt** — 年龄适配(5-10岁)、用词简单、不懂即换说法、可中英混说确认、话题守界; temperature 低 | P0 | AI-102 | done | 回复词汇量适配儿童; 不出现危险/超龄内容 |
| AI-405 | **场景包** — 5 个场景 (打招呼/动物园/买东西/天气/身体部位), 每个含 System Prompt + 起始语 + 目标词汇 | P0 | AI-404 | done | 场景可枚举选择; 各场景引导词正确 |
| AI-406 | **内容安全双保险** — 关键词黑名单拦截 + NVIDIA 内容安全模型 (`NVIDIA_SAFETY_MODEL` 默认 `nvidia/llama-3.1-nemoguard-8b-content-safety`) 二次分类过滤; 命中时返回安全兜底回复 | P0 | AI-403 | done | 注入测试词/恶意 prompt 被拦截或温和回应 |
| AI-407 | **`/chat` 页面 — 会话 UI** — 场景选择卡 + 气泡对话 + 吉祥物 TTS 语音条 + 每条消息"跟读"按钮 | P0 | AI-403, AI-307 | done | 气泡对话流畅; 语音自动播放; 跟读复用录音组件 |
| AI-408 | **对话星标与鼓励** — 完成 N 轮(如 8 轮)给星星 + 吉祥物庆祝; 会话 stars 持久化 | P1 | AI-407, AI-401 | done | 到轮数触发庆祝; 星星入库并在 Home 展示 |
| AI-409 | **会话历史与续聊** — 我的会话列表, 可恢复历史会话继续对话 | P1 | AI-401, AI-407 | done | 历史消息完整回显; 续聊上下文不丢 |

---

## M5 — AI 错题与进度报告 (W6)

| ID | Feature | 优先级 | 依赖 | 状态 | 验收标准 |
|---|---|---|---|---|---|
| AI-501 | **`ai_reports` 实体** — userId/date/summaryText/weakWords(JSON)/suggestionText/createdAt, (userId,date) 唯一防重复 | P0 | — | done | 同日重复生成返回已有报告 |
| AI-502 | **报告接口 `POST /api/ai/report/daily`** — 聚合当日 attempts/speechScores/taskComplete (来自 ProgressModule), 调用 AiProvider.chat(ReportAgent) | P0 | AI-106, 现有 ProgressModule, AI-501 | done | 无学习数据时返回友好默认报告; 有数据时含真实统计 |
| AI-503 | **ReportAgent System Prompt** — 输出 summaryText/weakWords/suggestion/mascotExpr 结构化 JSON; 语气鼓励、不批评 | P0 | AI-502 | done | 输出通过 JSON 校验; 弱项列表来自真实错题 |
| AI-504 | **Home "今日 AI 小结" 卡片** — 吉祥物气泡展示报告摘要 + 弱项 + 明日建议; 无报告时显示生成按钮 | P0 | AI-502 | done | 卡片展示报告; 点击可展开详情 |
| AI-505 | **自动生成触发** — 完成当日全部任务 或 每日固定时段(如 20:00)触发生成 | P1 | AI-502 | done | 完成条件触发一次; 不重复生成 |
| AI-506 | **家长周报 (邮件/推送)** — 每周聚合生成 HTML 总结发家长邮箱; 含掌握度、趋势、建议（注：backlog 原「现有 AuthModule(家长邮箱)」为预期能力，本 feature 在 `User` 实体新增 `parentEmail` 列落地收件人） | P1 | AI-502, User.parentEmail | done | 周报内容含 4 项以上指标; 邮件发送成功可追溯（AiParentEmailLog） |
| AI-507 | **家长报告 Dashboard** — 家长视角 Web 页: 按周查看孩子学习趋势、弱项 Top10、AI 建议 | P1 | AI-506 | done | 图表渲染趋势; 弱项列表可点击下钻到单词 |

---

## M6 — 增强与拓展 (W7+)

| ID | Feature | 优先级 | 依赖 | 状态 | 验收标准 |
|---|---|---|---|---|---|
| AI-601 | **AI 单词卡片生成** — 按兴趣/课程动态生成单词+例句+配图 prompt; 人工/自动审核后入库 | P1 | AI-106, AI-201 | backlog | 生成卡片入 `words` 表或待审表; 内容安全校验通过 |
| AI-602 | **AI 难度自适应** — 根据正确率/评分动态调整题目难度档位 (easy/medium/hard) 与复习优先级 | P1 | 现有 ProgressModule, AI-306 | backlog | 正确率高自动升级难度; 错题更频繁出现 |
| AI-603 | **吉祥物成长剧情** — 学习里程碑触发 AI 生成剧情文案, 吉祥物外观/配饰随等级升级 | P2 | AI-501 | backlog | 达到里程碑触发新剧情; 吉祥物状态持久化 |
| AI-604 | **AI 绘本生成** — 课程完成后按本课单词生成短篇故事绘本 (文本 + 配图), 可朗读 | P2 | AI-601, AI-402 | backlog | 绘本内容覆盖本课 ≥80% 单词; 可 TTS 朗读 |
| AI-605 | **AI 复习提醒** — 基于遗忘曲线 (间隔重复) 在薄弱单词即将遗忘时推送复习任务 | P2 | AI-602 | backlog | 过期单词进入当日任务; 提醒时机可配置 |
| AI-606 | **拍照学单词 (OCR)** — 孩子拍照/上传图片 (实物、绘本页、手写单词) → `chatWithImage` (GLM-4.6V-Flash) 识别物体/文字 → 生成单词卡片 (英文+中文+配图) 并加入生词本; 含 429 限流退避与"识别不出"友好兜底 | P1 | AI-102, 现有 WordsModule | backlog | 拍实物正确返回对应英文单词; 手写单词可被 OCR; 卡片入生词本; 限流时给出友好提示 |

---

## M7 — 成长激励与家长模式 (W7+)

> 来源: 对 `english-kids-workbench.html` 单文件 Demo 的融合分析 (2026-08-05)。该网页是纯前端 localStorage 原型, 已有能力 (`/practice` 单词卡 + 测验、`/plan` 学习计划、BigModel/M4 `/chat`) 已被本项目超越, **真正缺口** 为「成长激励(积分/等级/奖励商城)」与「家长模式(PIN锁/审批)」, 二者构成儿童产品核心留存钩子; 测验变体(听音选图/组词) 与逾期补学为体验增强。详见 2026-08-06 分析。

| ID | Feature | 优先级 | 依赖 | 状态 | 验收标准 |
|---|---|---|---|---|---|
| AI-701 | **成长激励系统（积分 / 等级 / 奖励商城 + 家长审批）** — 后端 `user_points`(余额, 等级档由分数推导)、`rewards`(奖励目录, 家长 CRUD)、`reward_redemptions`(pending/approved/rejected); 完成任务/单词/口语时累加积分; 前端 Home「我的奖励」卡 + `/rewards` 页(兑换申请→家长审批→已兑换展示); 等级环(如 英语宝宝→英语之星, 50分/级) | P0 | 现有 ProgressModule, AI-209, AI-307 | backlog | 积分随学习行为累加; 等级档正确推导; 兑换走 pending→家长批准/驳回→已兑换; 奖励目录可家长增删; 后端三实体落库 |
| AI-702 | **家长模式骨架（PIN 锁 + 控制面板）** — 家长入口 4 位 PIN(按 child 哈希存储, 非明文); 控制面板含奖励审批(AI-701 兑换) + 未来 M5 报告入口; 儿童模式默认无审批权限; PIN 修改入口 | P0 | 现有 AuthModule (child), AI-701 | backlog | PIN 锁可挡儿童进入家长区; PIN 哈希存储不落明文; 面板可批准/驳回兑换; 未来 M5 报告入口预留 |
| AI-703 | **测验变体扩展（听音选图 + 组词）** — 给 `Word` 加 `category`/`color` 属性; `/practice` 新增「听音选图」(音频优先, 隐藏文字) 与「组词」(颜色+物品组合) 两种模式; 纯前端出题/判定逻辑 + 单测 | P1 | 现有 WordsModule, /practice | backlog | 两种新模式可切换出题; 听音选图正确判定; 组词组合合法; 出题/判定函数有单测覆盖 |
| AI-704 | **逾期 / 补学循环** — 昨日未掌握/未完成任务进入「补学队列」并可补学拿分; 与 AI-605 间隔复习协同(补学队列是 AI-605 的当日触发源之一), 不重复计分; 补学完成回写完成态 | P1 | AI-209 (planDay.isDone 跟踪), AI-605 | backlog | 未完成词/任务次日进补学队列; 补学完成计分给分; 与 AI-605 不重复; 完成态回写 |

---

## 里程碑汇总

| 里程碑 | 包含 | 完成标志 |
|---|---|---|
| **测试基线** (置顶优先) | TEST-101 ~ TEST-102 | 单测全绿 + BDD/E2E 核心用户旅程跑通 |
| **Milestone 1** (W1) | AI-101 ~ AI-108 | AiProvider 三 provider 可用, 无 key 可 mock 演示 |
| **Milestone 2** (W2) | AI-201 ~ AI-209 | `/plan` 页生成+应用真实/模板计划, 任务联动 |
| **Milestone 3** (W3-W4) | AI-301 ~ AI-309 | `/speech` 页完整 听→录→评→星 闭环 |
| **Milestone 4** (W5) | AI-401 ~ AI-409 | `/chat` 页场景对话 + TTS + 跟读闭环 |
| **Milestone 5** (W6) | AI-501 ~ AI-507 | Home 每日 AI 小结 + 家长周报 |
| **Milestone 6** (W7+) | AI-601 ~ AI-606 | 自适应与内容生成增强 |
| **Milestone 7** (W7+) | AI-701 ~ AI-704 | Home 奖励卡 + 家长 PIN 审批 + 测验变体 |

> 每里程碑独立可交付, 验收通过 `lsp_diagnostics` 零错误 + `next build` 成功 + 真机演示。
