# AI 集成功能 Backlog

> 来源: `docs/ai-integration.md`
> 更新: 2026-07-31
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

## M1 — AI 基建 (W1)

| ID | Feature | 优先级 | 依赖 | 状态 | 验收标准 |
|---|---|---|---|---|---|
| AI-101 | **AiProvider 接口定义** — 新建 `server/src/ai/ai-provider.interface.ts`, 定义 `chat / transcribe / assessPronunciation / synthesize` 四个方法签名及 `TranscriptResult / ScoreResult / ChatResult` 类型 | P0 | — | backlog | TS strict 编译通过; 接口有 JSDoc; 类型覆盖 LLM/STT/TTS/发音评测 |
| AI-102 | **BigModel provider 实现** — `bigmodel.provider.ts` 实现接口: chat 走智谱 OpenAI 兼容端点 `https://open.bigmodel.cn/api/paas/v4/chat/completions` (Bearer key); 模型经 `BIGMODEL_MODEL` 配置 (默认 `glm-4.7-flash`); ⚠️ 推理模型: 响应含 `reasoning_content`+`content`, provider 只读 `content`, `max_tokens` ≥512, 超时 ≥60s; `chatWithImage` 走 `BIGMODEL_VISION_MODEL` (默认 `glm-4.6v-flash`, base64 image_url 输入); STT/TTS 待评估, 暂用 mock/降级 | P0 | AI-101 | backlog | 真实 key 下跑通一次 chat 并返回 content; 多模态/OCR 调用返回文本; 无效 key 返回清晰错误 |
| AI-103 | **AiModule 动态装配** — `ai.module.ts` 按 `.env` 的 `AI_PROVIDER` 值注册对应 provider (`bigmodel` \| `nvidia` \| `mock`), 未配置时注册 MockProvider | P0 | AI-102 | backlog | 无 key 时应用可启动; provider 切换只改 env 一处 |
| AI-104 | **MockProvider** — 返回确定性假数据的 provider (固定 plan/报告文本、假评分), 供开发与测试 | P0 | AI-101 | backlog | 无 key 时前端可跑通全流程演示 |
| AI-105 | **配置与密钥管理** — `.env.example` 增加 `AI_PROVIDER/NVIDIA_API_KEY/NVIDIA_BASE_URL/NVIDIA_MODEL/NVIDIA_SAFETY_MODEL`, 接入现有 `ConfigModule`, 缺失时启动告警; `.env` 不入 git | P0 | AI-103 | backlog | 缺 key 启动打印 warning; key 不进入 git |
| AI-106 | **重试与降级** — provider 调用封装 3 次指数退避重试; 超时(默认 60s, 推理模型); 429 限流 (code 1305) 视为瞬时错误, 退避重试 + 降低并发; 失败抛 `AiProviderException` 并由业务层降级; NVIDIA 端 `404 Function not found for account` / 挂起错误需识别并映射为 `AiAccessError` 提示账户权限问题 | P0 | AI-103 | backlog | 模拟 5xx/429 自动重试; 连续失败抛可识别异常; 权限错误给出明确文案 |
| AI-107 | **每日 token/调用配额** — `common/limits.ts` 记录每用户每日调用次数与 token 用量, 超限返回 429 + 降级标记 | P1 | AI-106 | backlog | 配小额配额可触发 429; 配额数据持久化到 `ai_usage` 表 |
| AI-108 | **AI 调用日志** — 记录每次 LLM 调用 (用户、模块、token、耗时、结果截断) 到日志/表, 便于排查与成本审计 | P1 | AI-106 | backlog | 每次调用有可检索日志; 敏感内容截断 |

---

## M2 — AI 学习计划生成 (W2)

| ID | Feature | 优先级 | 依赖 | 状态 | 验收标准 |
|---|---|---|---|---|---|
| AI-201 | **`study_plans` / `study_plan_days` 实体** — 建表, 与 User 关联, `skill_type` 枚举 (vocab/listen/speak/write), status (draft/applied/archived) | P0 | — | backlog | TypeORM 迁移/同步建表; 与现有 entities 风格一致 |
| AI-202 | **生成接口 `POST /api/ai/plan/generate`** — DTO (childId, ageRange, level, dailyMinutes, interests, weeks); 调用 AiProvider.chat; 返回结构化 Plan | P0 | AI-106, AI-201 | backlog | 合法入参返回 plan JSON; 非法入参被 class-validator 拦截返回 400 |
| AI-203 | **PlanAgent System Prompt** — 中文/英文双语儿科友好提示词: 每天 1 主课+2 复习+1 口语、间隔复习、技能交错、内容安全红线; 低 temperature | P0 | AI-102 | backlog | 输出课程引用真实 course/lesson id; 无超龄/危险内容 |
| AI-204 | **Plan JSON Schema 校验与重试** — 校验 LLM 输出结构与 lesson 引用有效性; 失败自动重试(≤3次); 仍失败降级到内置模板计划 | P0 | AI-202, AI-203 | backlog | 构造坏 JSON 时自动重试; 3 次后返回模板计划并标记 degraded |
| AI-205 | **内置模板计划** — 3 套静态周计划 (按 dailyMinutes 档位), 用于降级 | P0 | AI-201 | backlog | 无 LLM 时可选模板生成计划 |
| AI-206 | **计划持久化与"应用计划"** — `POST /api/ai/plan/:id/apply` 将计划落库为 applied, 并按天写入现有 `tasks` 表 | P0 | AI-201, 现有 TasksModule | backlog | 应用后每日任务列表出现对应任务; 重复应用提示确认 |
| AI-207 | **`/plan` 页面 — 向导表单** — 年龄段/等级/每日时长/兴趣/周数选择器, 大触控目标, 沿用 cozy-kids 风格, 狐狸吉祥物引导 | P0 | AI-202 | backlog | 表单校验完整; 提交调 generate 接口 |
| AI-208 | **`/plan` 页面 — 计划展示与交互** — 周计划卡片视图 (每日颜色化), "重新生成"、"应用此计划"、单日任务勾选 | P0 | AI-206, AI-207 | backlog | 应用后跳转 Home 并看到新任务; 重新生成有 loading/降级提示 |
| AI-209 | **计划进度回写** — 完成计划内任务时回写 planDay.isDone, Home 展示计划完成度 | P1 | AI-206, 现有 ProgressModule | backlog | 完成任务后计划完成度同步更新 |

---

## M3 — AI 每日口语训练 (W3-W4)

| ID | Feature | 优先级 | 依赖 | 状态 | 验收标准 |
|---|---|---|---|---|---|
| AI-301 | **`ai_speech_attempts` 实体** — 记录 userId/wordId/sentenceId/audioPath/score/weakPhonemes/createdAt | P0 | — | backlog | 建表; 与现有 entities 风格一致 |
| AI-302 | **录音采集组件** — 前端 `SpeechRecorder` (MediaRecorder → webm/opus), 录音时长上限(如 10s), 权限引导与错误提示; iOS 降级 audio/mp4 | P0 | — | backlog | 平板 Safari/Chrome 均可录音; 拒绝权限时给出友好提示 |
| AI-303 | **评测接口 `POST /api/ai/speech/evaluate`** — multer 接收 audio + wordId/sentenceId; 校验大小/格式/时长 | P0 | AI-302, AI-106 | backlog | 合法音频返回评分; 超大/空音频返回 4xx |
| AI-304 | **STT 集成** — `transcribe(audio)` 转写文本+时戳; 失败时走降级 | P0 | AI-102, AI-303 | backlog | 清晰发音的单词可被转写; 静音音频返回低分 |
| AI-305 | **发音评分策略** — 首选 Azure Pronunciation Assessment (phoneme 级); 无 Azure 时用"转写文本相似度 (编辑距离) + LLM 评估"兜底 | P0 | AI-304 | backlog | 两种策略输出统一 `ScoreResult`; 分数 ∈ [0,100] |
| AI-306 | **评分反馈** — 返回 score/readableText/weakPhonemes/feedback/mascotExpr; 通过线 60 分; 分数与弱音素持久化 | P0 | AI-301, AI-305 | backlog | 分数正确入库; weakPhonemes 可展示 |
| AI-307 | **`/speech` 页面 — 跟读卡片** — 单词/句子卡片 + 吉祥物 TTS 朗读按钮 + 录音/重试/提交; 完成后攒星 + 庆祝动画 | P0 | AI-302, AI-306, AI-402 | backlog | 完整流程: 听→录→评→反馈→得星; 星级动画触发 |
| AI-308 | **口语任务联动** — 每日任务中 mic 类任务点击进入 `/speech`; 完成后任务勾选+进度回写 | P0 | AI-307, 现有 TasksModule | backlog | 从 Home 任务卡直达口语页; 完成后任务状态更新 |
| AI-309 | **句子跟读库** — 预置 30-50 句分级跟读句 (P0 单词覆盖); 供句子模式使用 | P1 | AI-306 | backlog | 句库可查询; 与课程词汇关联 |

---

## M4 — AI 对话陪练 (W5)

| ID | Feature | 优先级 | 依赖 | 状态 | 验收标准 |
|---|---|---|---|---|---|
| AI-401 | **`ai_chat_sessions` / `ai_chat_messages` 实体** — session (userId/sceneId/stars), message (role/text/audioPath) | P0 | — | backlog | 建表; 关联 User |
| AI-402 | **TTS 集成** — `synthesize(text, voice)` 生成音频, 返回 URL 或 base64; 前端自动播放 | P0 | AI-102 | backlog | 狐狸音色发音自然; 播放可中断/重播 |
| AI-403 | **聊天接口 `POST /api/ai/chat/messages`** — 接收 sessionId/sceneId/text; 组装历史+场景 prompt; 返回 replyText + ttsUrl | P0 | AI-401, AI-402 | backlog | 多轮上下文保持; 回复落库 |
| AI-404 | **狐狸人设 System Prompt** — 年龄适配(5-10岁)、用词简单、不懂即换说法、可中英混说确认、话题守界; temperature 低 | P0 | AI-102 | backlog | 回复词汇量适配儿童; 不出现危险/超龄内容 |
| AI-405 | **场景包** — 5 个场景 (打招呼/动物园/买东西/天气/身体部位), 每个含 System Prompt + 起始语 + 目标词汇 | P0 | AI-404 | backlog | 场景可枚举选择; 各场景引导词正确 |
| AI-406 | **内容安全双保险** — 关键词黑名单拦截 + NVIDIA 内容安全模型 (`NVIDIA_SAFETY_MODEL` 默认 `nvidia/llama-3.1-nemoguard-8b-content-safety`) 二次分类过滤; 命中时返回安全兜底回复 | P0 | AI-403 | backlog | 注入测试词/恶意 prompt 被拦截或温和回应 |
| AI-407 | **`/chat` 页面 — 会话 UI** — 场景选择卡 + 气泡对话 + 吉祥物 TTS 语音条 + 每条消息"跟读"按钮 | P0 | AI-403, AI-307 | backlog | 气泡对话流畅; 语音自动播放; 跟读复用录音组件 |
| AI-408 | **对话星标与鼓励** — 完成 N 轮(如 8 轮)给星星 + 吉祥物庆祝; 会话 stars 持久化 | P1 | AI-407, AI-401 | backlog | 到轮数触发庆祝; 星星入库并在 Home 展示 |
| AI-409 | **会话历史与续聊** — 我的会话列表, 可恢复历史会话继续对话 | P1 | AI-401, AI-407 | backlog | 历史消息完整回显; 续聊上下文不丢 |

---

## M5 — AI 错题与进度报告 (W6)

| ID | Feature | 优先级 | 依赖 | 状态 | 验收标准 |
|---|---|---|---|---|---|
| AI-501 | **`ai_reports` 实体** — userId/date/summaryText/weakWords(JSON)/suggestionText/createdAt, (userId,date) 唯一防重复 | P0 | — | backlog | 同日重复生成返回已有报告 |
| AI-502 | **报告接口 `POST /api/ai/report/daily`** — 聚合当日 attempts/speechScores/taskComplete (来自 ProgressModule), 调用 AiProvider.chat(ReportAgent) | P0 | AI-106, 现有 ProgressModule, AI-501 | backlog | 无学习数据时返回友好默认报告; 有数据时含真实统计 |
| AI-503 | **ReportAgent System Prompt** — 输出 summaryText/weakWords/suggestion/mascotExpr 结构化 JSON; 语气鼓励、不批评 | P0 | AI-502 | backlog | 输出通过 JSON 校验; 弱项列表来自真实错题 |
| AI-504 | **Home "今日 AI 小结" 卡片** — 吉祥物气泡展示报告摘要 + 弱项 + 明日建议; 无报告时显示生成按钮 | P0 | AI-502 | backlog | 卡片展示报告; 点击可展开详情 |
| AI-505 | **自动生成触发** — 完成当日全部任务 或 每日固定时段(如 20:00)触发生成 | P1 | AI-502 | backlog | 完成条件触发一次; 不重复生成 |
| AI-506 | **家长周报 (邮件/推送)** — 每周聚合生成 PDF/HTML 总结发家长邮箱; 含掌握度、趋势、建议 | P1 | AI-502, 现有 AuthModule(家长邮箱) | backlog | 周报内容含 4 项以上指标; 邮件发送成功可追溯 |
| AI-507 | **家长报告 Dashboard** — 家长视角 Web 页: 按周查看孩子学习趋势、弱项 Top10、AI 建议 | P1 | AI-506 | backlog | 图表渲染趋势; 弱项列表可点击下钻到单词 |

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

## 里程碑汇总

| 里程碑 | 包含 | 完成标志 |
|---|---|---|
| **Milestone 1** (W1) | AI-101 ~ AI-108 | AiProvider 三 provider 可用, 无 key 可 mock 演示 |
| **Milestone 2** (W2) | AI-201 ~ AI-209 | `/plan` 页生成+应用真实/模板计划, 任务联动 |
| **Milestone 3** (W3-W4) | AI-301 ~ AI-309 | `/speech` 页完整 听→录→评→星 闭环 |
| **Milestone 4** (W5) | AI-401 ~ AI-409 | `/chat` 页场景对话 + TTS + 跟读闭环 |
| **Milestone 5** (W6) | AI-501 ~ AI-507 | Home 每日 AI 小结 + 家长周报 |
| **Milestone 6** (W7+) | AI-601 ~ AI-605 | 自适应与内容生成增强 |

> 每里程碑独立可交付, 验收通过 `lsp_diagnostics` 零错误 + `next build` 成功 + 真机演示。
