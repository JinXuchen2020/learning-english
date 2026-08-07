# M5 — AI 错题与进度报告 (W6)

> 本里程碑共 **7** 个 feature，均已 `done`。


| ID | Feature | 优先级 | 依赖 |
|---|---|---|---|
| AI-501 | `ai_reports` 实体 | P0 | — |
| AI-502 | 报告接口 `POST /api/ai/report/daily` | P0 | AI-106, 现有 ProgressModule, AI-501 |
| AI-503 | ReportAgent System Prompt | P0 | AI-502 |
| AI-504 | Home "今日 AI 小结" 卡片 | P0 | AI-502 |
| AI-505 | 自动生成触发 | P1 | AI-502 |
| AI-506 | 家长周报 (邮件/推送) | P1 | AI-502, User.parentEmail |
| AI-507 | 家长报告 Dashboard | P1 | AI-506 |

---

## AI-501 — `ai_reports` 实体

> 优先级 **P0** · 依赖 — · 状态 done

**目标**

为 M5「AI 错题与进度报告」落地**数据底座**：建立 `ai_reports` 表，记录每个儿童每一天的 AI 学习小结
（`userId` / `date` / `summaryText` / `weakWords` / `suggestionText` / `createdAt`）；
以 `(userId, date)` **唯一约束**保证「同日重复生成返回已有报告」（AI-502 的生成幂等由该约束兜底）。
后续 AI-502（聚合接口）/ AI-504（Home「今日 AI 小结」卡片）/ AI-506（家长周报）将直接消费本 feature 的实体与 `AiModule` 仓库。

**验收标准**

- [ ] `ai_reports` 表由 `synchronize` 自动建立（`DataSource.initialize` 不抛错，CI seed 同等校验）。
- [ ] `(userId, date)` 唯一：同用户同日两条 `save` 第二次抛唯一约束错误（AI-502 据此返回已有报告）。
- [ ] `weakWords` 为空 / 多元素时经 `simple-array` round-trip 一致；`summaryText` / `suggestionText` 正确落库。
- [ ] `createdAt` 自动生成。
- [ ] `nest build` / `tsc` 0 错误；jest 全绿；覆盖率 90/70 基线不退化；pre-commit 质量门强执通过。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（jest + ts-jest，覆盖有逻辑分支的源码）**

- `ai-report.entity.spec.ts`：in-memory better-sqlite3 + `appEntities` 行为测试
  - synchronize 建表：`ai_reports` 表存在，save 后 `id` 生成、`createdAt` 为 `Date`。
  - 默认值：`weakWords` 空数组 round-trip 仍为 `[]`；`suggestionText` 默认 `''`。
  - `simple-array` 多元素 round-trip 一致（`['apple','banana','cat']` 存读一致，可移植到 postgres）。
  - `(userId,date)` 唯一约束：同用户同日第二次 `save` 抛 `QueryFailedError`（唯一冲突），证明幂等兜底成立。
  - 不同用户 / 不同日期可共存（约束只作用于同组合）。

**7. 质量门（Phase 4 嵌入）**

- consistency: `nest build`/`tsc` 0 错误；jest 全绿；`synchronize` 建表成功（`seed` 不抛）；纯后端无全栈契约。
- tests: 单元测试 1 文件（entity.spec）全绿，覆盖 `simple-array` round-trip / 默认值 / 唯一约束 / 多用户共存；BDD/E2E 0（纯后端豁免，设计文档显式标注）。
- review: 0 open（空安全/唯一约束/可移植/时间列铁律/无裸 console/与 AiUsage 风格一致）。
- optimization: 0 open（无 stub/占位；simple-array 复用；无临时调试）。


---

## AI-502 — 报告接口 `POST /api/ai/report/daily`

> 优先级 **P0** · 依赖 AI-106, 现有 ProgressModule, AI-501 · 状态 done

**目标**

落地 M5「AI 错题与进度报告」的**聚合与生成接口**：`POST /api/ai/report/daily`。
接收 `userId` 与可选 `date`，聚合该儿童当日学习统计（任务完成 / 单词练习 / 课程完成 / 口语尝试与平均分），
据此生成（或返回已有）每日 AI 小结并落库到 `ai_reports`（AI-501 实体）。

两条核心验收（来自 backlog）：
- **无学习数据时返回友好默认报告**（不调 AI，省 token，且仍持久化以保证当日幂等）。
- **有数据时含真实统计**（调用 `AiProvider.chat(ReportAgent)`，把真实统计喂给模型，输出鼓励语气小结）。

**验收标准**

- [ ] `POST /api/ai/report/daily` 200 返回 `DailyReportResponse` 结构。
- [ ] 无当日活动 → 返回 `isDefault=true` 的友好默认报告，且已落库（幂等）。
- [ ] 有当日活动 → 返回 `isDefault=false`、`stats` 含真实统计、`summaryText/weakWords/suggestionText` 来自 AI 输出。
- [ ] 同日重复调用 → 返回已有报告（唯一约束兜底），不重复生成。
- [ ] AI 调用失败 → 降级默认（`isDefault=true`）且不持久化，接口不 500。
- [ ] `nest build`/`tsc` 0 错误；jest 全绿；`seed` 不抛；pre-commit 质量门强执通过。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（jest + ts-jest，覆盖有逻辑分支的源码）**

- `ai-report.service.spec.ts`：
  - 聚合：mock 四个仓库返回已知行，`getDailyStats` 计算正确（含 avgSpeechScore 四舍五入、null）。
  - 无活动 → `isDefault=true`、未调用 `AiProvider.chat`、调用 `reportRepo.save`（持久化默认）。
  - 有活动 → 调用 `AiProvider.chat`、解析返回、`reportRepo.save` 真实报告、`isDefault=false`。
  - 幂等：已有报告 → 直接返回、不调 chat、不 save。
  - AI 失败 → 捕获、`isDefault=true`、未 save（降级不缓存）、不抛。
  - `parseReportAgentOutput`：纯 JSON / 带 ```json 围栏 / 多余文本包裹 / 缺字段给默认 / weakWords 非数组兜底。
  - 唯一约束 race：`save` 抛 `QueryFailedError` → 回查返回已有。
- `ai-report.controller.spec.ts`：`POST daily` 透传 `userId`/`date` 到 service；默认 case 返回 `isDefault=true`。
- `ai.module.spec.ts`：补 `TaskCompletion`/`WordProgress`/`LessonProgress` 假 repo override（保 DI 装配）。

**9. 质量门（Phase 4 嵌入）**

- consistency: `nest build`/`tsc` 0 错误；jest 全绿；`seed` 不抛；纯后端无全栈契约。
- tests: 单元测试 2 文件（service.spec + controller.spec）全绿，覆盖聚合/默认/真实/幂等/降级/解析/race；BDD/E2E 0（纯后端豁免，设计文档显式标注）。
- review: 0 open（空安全/唯一约束/日期口径/JSON 解析兜底/无裸 console）。
- optimization: 0 open（无 stub/占位；复用 `@Global` 仓库；降级不缓存；降级路径不落库）。


---

## AI-503 — ReportAgent System Prompt

> 优先级 **P0** · 依赖 AI-502 · 状态 done

**目标**

精炼 `server/src/ai/report-agent.ts` 的 `REPORT_AGENT_SYSTEM_PROMPT`，让每日报告**真正可用、对儿童安全、弱项来自真实错题**：

- **儿童友好、绝不批评**：温暖、具体、像伙伴；禁止恐吓/比较/贴标签（"笨""差""别人都会"类表述）。
- **弱项来自真实错题（核心验收）**：`weakWords` 必须是传入的 `weakWordCandidates`（当日低正确率真实单词）的子集；无候选时给 `[]`；**严禁编造**任何未出现在候选里的单词。
- **mascotExpr 决策规则明确**：有真实进展（完成任务/完成课程/口语分高）→ `cheer`/`happy`；明显吃力（口语分低/任务少）→ `encourage`；中性混合 → `thinking`。

**不新增接口**（backlog 约束）：仅改 prompt + 让"弱项来自真实错题"可满足的 payload 增强（见 §3），不改 `POST /api/ai/report/daily` 契约。

**验收标准**

- 单测（AI-502 既有 + AI-503 新增）：
  - `getDailyStats` 期望含 `weakWordCandidates`；新增「低正确率单词入选、全对单词排除、上限 5」推导测试。
  - 「有活动」测试断言 `aiProvider.chat` 的 user 消息含 `weakWordCandidates`（验证 prompt 精炼已接线）。
  - 解析鲁棒性（code fence / 夹带文本 / 字段缺失兜底 / mascotExpr 非法退 encourage）维持。
- 一致性：`nest build` 0 错误；`jest` 全绿；`npm run seed` 不抛。
- 质量门：四道通用门（consistency/tests/review/optimization）全 PASSED，flat `.quality-gate.json`。
- 文档：backlog AI-503 → done；新增 `docs/quality/ai-503-gate.md`；`docs/ai-integration.md` 若提及 ReportAgent 提示则同步。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**4. 测试 / 验收**

- 单测（AI-502 既有 + AI-503 新增）：
  - `getDailyStats` 期望含 `weakWordCandidates`；新增「低正确率单词入选、全对单词排除、上限 5」推导测试。
  - 「有活动」测试断言 `aiProvider.chat` 的 user 消息含 `weakWordCandidates`（验证 prompt 精炼已接线）。
  - 解析鲁棒性（code fence / 夹带文本 / 字段缺失兜底 / mascotExpr 非法退 encourage）维持。
- 一致性：`nest build` 0 错误；`jest` 全绿；`npm run seed` 不抛。
- 质量门：四道通用门（consistency/tests/review/optimization）全 PASSED，flat `.quality-gate.json`。
- 文档：backlog AI-503 → done；新增 `docs/quality/ai-503-gate.md`；`docs/ai-integration.md` 若提及 ReportAgent 提示则同步。


---

## AI-504 — Home "今日 AI 小结" 卡片

> 优先级 **P0** · 依赖 AI-502 · 状态 done

**目标**

在 Home（`src/app/page.tsx`）顶部新增**「今日 AI 小结」卡片**，消费 AI-502 的
`POST /api/ai/report/daily`，以吉祥物气泡形式展示当日 AI 报告：

- **摘要气泡**：`summaryText`（小狐口吻，儿童友好）
- **弱项词**：`weakWords[]` 以 chip 展示（AI-503 保证来自真实错题）
- **明日建议**：`suggestionText`
- **吉祥物表情**：`mascotExpr`（后端枚举 `happy|encourage|thinking|cheer`）经既有
  `mapBackendMascotExpr`（`src/lib/speech.ts`）映射到前端 `Mascot` 枚举
  （`happy|thinking|celebrating|encouraging`），**复用不重造**
- **展开详情**：点击「查看详情」展示 `date` + 默认报告提示（`isDefault`）
- **无报告 / 拉取失败**：显示小狐 `thinking` +「生成今日小结」按钮，点击重试

**纯前端消费层**：不新增后端接口（backlog 约束）；后端契约由 AI-502 定义、提示由 AI-503 精炼。

**验收标准**

- [x] 卡片展示报告（summary + weakWords + suggestion + mascotExpr）
- [x] 点击可展开详情（date + 默认提示）
- [x] 无报告/失败 → 显示生成按钮（可重试）

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**3.4 单元测试（Vitest，`src/lib/api.spec.ts`）**

- `getDailyReport` 成功：`fetch` 被调用 `POST /api/ai/report/daily`，体含 `userId`，无 `date` 时体为 `{userId}`，有 `date` 时含 `date`；返回体映射为 `DailyReportResponse`。
- `getDailyReport` 400：`ApiError` 抛出且 `status===400`。
（`src/lib/api.ts` 属纯逻辑封装，按 feature-builder 前端单测铁律必测；E2E 覆盖 UI 行为。）

**5. 测试 / 质量门**

- 单元：`src/lib/api.spec.ts`（getDailyReport × 成功/400），Vitest 全绿。
- BDD/E2E：`home-dashboard.feature` 3 scenario（报告卡展示 / 展开详情 / 失败重试）。
- 一致性：前端 `tsc --noEmit` 0 错误；Vitest 全绿；`next build` 通过（可选跑 E2E 验证真实交互）。
- 质量门：四道通用门（consistency / tests / review / optimization）全 PASSED，flat `.quality-gate.json` 通过 pre-commit hook。


---

## AI-505 — 自动生成触发

> 优先级 **P1** · 依赖 AI-502 · 状态 done

**目标**

AI-502 已落地 `POST /api/ai/report/daily`（`AiReportService.generateDailyReport`），且**幂等**（同日已有报告直接返回）、**无活动自动友好默认**、**有活动调 AI 生成**、**AI 失败降级**。
AI-504 的 Home「今日 AI 小结」卡片在加载时调用该接口拉取报告。

但当前报告只在「用户打开 Home 触发前端拉取」时生成——若用户当天从未打开 Home，则报告不会生成，家长周报（AI-506）也拿不到数据。
本 feature 增加**后端自动触发**，让每日报告在两种条件下自动生成（且不重复）：

1. **完成当日全部任务** → 立即触发生成（孩子在完成最后一项任务的那一刻，报告就备好了）。
2. **每日固定时段（默认 20:00）** → 全量扫描所有用户补生成（覆盖「当天活跃但没做完所有任务 / 没打开 Home」的孩子）。

验收核心：**完成条件触发一次；不重复生成**（由 AI-502 幂等保证）。

**验收标准**

- [ ] 完成当日**全部**任务（新完成时）触发一次 `generateDailyReport(userId)`；报告为生成时刻快照。
- [ ] 完成**部分**任务（未全部完成）/ 重复完成已完成的任务 → **不**触发。
- [ ] 用户当日**零任务** → 不触发（无「任务」可全部完成）。
- [ ] 每日 20:00（本地）`runDailySweep` 遍历所有用户各调一次 `generateDailyReport`，逐用户容错。
- [ ] `computeMsUntilNext` 在「当前 < 20:00」返回到今日 20:00 的延迟；「当前 ≥ 20:00」返回到明日 20:00（约 24h）。
- [ ] `nest build` / `tsc` 0 错误；jest 全绿；pre-commit 质量门强执通过。
- [ ] 任务完成主流程**不受**报告生成失败影响（副作用隔离）。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（jest + ts-jest，覆盖有逻辑分支的源码）**

- **扩展 `tasks.service.spec.ts`**（注入 `AiReportService` 假对象）：
  - 完成最后一项任务（当日全部完成）→ `aiReportService.generateDailyReport` 被调用 1 次且参数为该 `userId`。
  - 完成一项但**未全部完成** → 不调用 `generateDailyReport`。
  - 完成已完成的任务（`alreadyCompleted:true`）→ 不调用 `generateDailyReport`。
  - 当日零任务（任务列表为空）→ 不调用 `generateDailyReport`。
- **新增 `report-scheduler.service.spec.ts`**（直接 `new ReportSchedulerService(aiReportService, userRepo)`，不触发 `onModuleInit`）：
  - `computeMsUntilNext`：当前 10:00 → ≈10h；当前 21:00 → ≈23h（到明日 20:00）；给定固定 `now` 断言精确毫秒。
  - `runDailySweep`：`userRepo.find` 返回 `[u1,u2]` → `generateDailyReport` 被调用 2 次，参数分别为 `u1.id`/`u2.id`。
  - `runDailySweep` 容错：`u1` 抛错时 `u2` 仍被调用、`runDailySweep` 不 reject。
  - `start()`/`stop()`：用 `jest.useFakeTimers()`，`start()` 后 `jest.getTimerCount()` 增加；`stop()` 后定时器被清除；断言到点后 `runDailySweep` 被调度（advanceTimersByTime 到计算延迟）。

**7. 质量门（Phase 4 嵌入）**

- consistency: `nest build`/`tsc` 0 错误；jest 全绿；纯后端无全栈契约新增。
- tests: 单元测试 2 处增强（tasks.service.spec 扩展 + 新增 report-scheduler.service.spec），覆盖双触发 + 边界 + 容错；BDD/E2E 0（纯后端触发豁免，报告卡旅程 AI-504 已覆盖）。
- review: 0 open（副作用隔离 / 无循环依赖 / 无裸 console / 幂等复用）。
- optimization: 0 open（无 stub；不引入新依赖；轻量调度）。


---

## AI-506 — 家长周报 (邮件/推送)

> 优先级 **P1** · 依赖 AI-502, User.parentEmail · 状态 done

**目标**

每周聚合儿童一周（`ai_reports` + 当日统计）生成一份**家长周报**，含 ≥4 项指标（活跃天数 / 完成任务 / 练习单词 / 完成课程 / 口语跟读 / 平均口语分），渲染为自包含 HTML 邮件，发送给家长邮箱，并持久化发送记录**可追溯**。

- 触发方式（与 AI-505 同构）：
  - **按需**：`POST /api/ai/report/weekly`（家长 Dashboard / 调试可触发，接受 `recipientEmail` 覆盖）。
  - **自动**：扩展 AI-505 `ReportSchedulerService`，每周固定日/时（默认周日 20:00）扫描所有含 `parentEmail` 的用户生成并发送。
- **本 feature 不新建前端 UI**（家长可视化 Dashboard 属 AI-507）。纯后端能力，复用已落库的每日报告数据。

**验收标准**

1. 周报内容含 **4 项以上指标**（活跃天数、完成任务数、练习单词数、完成课程数、口语跟读次数、平均口语分）。
2. 邮件发送**成功可追溯**：每条发送落 `ai_parent_email_logs`（to / subject / status / weekStart / htmlPath / errorText / sentAt）。
3. 无 `parentEmail` 的用户在扫描中被**安全跳过**（不报错、不阻整轮）。
4. 同一周重复触发生成不重复发信（weekStart 维度去重见 §5）。
5. `nest build` 0 错；jest 全绿；四道质量门 PASSED。

**关键文件**

新增：`ai-parent-email-log.entity.ts`、`email-sender.interface.ts`、`log-email-sender.service.ts`、`email.service.ts`、`weekly-report.service.ts`、`weekly-report.service.spec.ts`、`log-email-sender.service.spec.ts`、`email.service.spec.ts`、`generate-weekly-report.dto.ts`、`ai-weekly-report.controller.ts`、`ai-weekly-report.controller.spec.ts`。
修改：`entities/user.entity.ts`、`config/database.config.ts`、`ai.module.ts`、`report-scheduler.service.ts`、`report-scheduler.service.spec.ts`、`ai.module.spec.ts`。

**测试与质量门**

**8. 测试策略（E2E 豁免）**

纯后端能力、无用户可感知 UI 旅程（Dashboard 属 AI-507），沿用 AI-501/502/505「纯后端 E2E 豁免」口径；以单测覆盖全部分支：
- `weekly-report.service.spec.ts`：`weekStartOf`(Monday)、`buildWeeklyReport` 指标/弱项/趋势、发信+落库（有 parentEmail）、无收件人跳过、发信失败落 `failed` 不抛。
- `log-email-sender.service.spec.ts`：写文件 + 返回 accepted + htmlPath；非法文件名 sanitize。
- `email.service.spec.ts`：委托 sender。
- `ai-weekly-report.controller.spec.ts`：透传 + 跳过/失败响应。
- `report-scheduler.service.spec.ts`：扩展每周扫描（仅含 parentEmail 用户、env 开关、`computeMsUntilNextWeekday`）。
- `ai.module.spec.ts`：加 `fakeAiParentEmailLogRepo` + `overrideProvider(EMAIL_SENDER_TOKEN)` 假值，保证 `AiModule` 仍可无真实 DB 编译。


---

## AI-507 — 家长报告 Dashboard

> 优先级 **P1** · 依赖 AI-506 · 状态 done

**目标**

家长视角的 Web 页，按周查看孩子的学习情况：**趋势图表**、**弱项 Top10（可点击下钻到单词）**、**AI 建议**。复用 AI-506 `WeeklyReportService.buildWeeklyReport` 的聚合结果，新增一个**只读预览端点**（不发送邮件），前端渲染可视化 Dashboard。

- 路由：`/parent-report`（App Router 页面，AuthGate 包裹，复用已登录 child 的 `user.id`）。
- 数据来源：`GET /api/ai/report/weekly/preview?userId=&weekStart=`（新增，**不加 guard**，与 AI-502/504/506 同口径；仅聚合不发送）。
- 周切换：prev/next 周（客户端 ±7 天，调用同一端点传不同 `weekStart`）。
- 弱项下钻：点击弱项单词 → 导航到 `/practice?focusWord=<text>`，practice 页聚焦该单词（AI-507 在 `app/practice` 增加 `focusWord` 支持）。

**验收标准**

1. **图表渲染趋势**：Dashboard 渲染一周（7 天）学习趋势图（`masteryTrend`：每日任务完成数 + 口语平均分）。
2. **弱项列表可点击下钻到单词**：弱项 Top10 中点击任一单词 → 进入 `/practice` 并聚焦该单词。
3. 指标卡展示 ≥4 项（活跃天数 / 完成任务 / 练习单词 / 完成课程 / 口语跟读 / 平均口语分）。
4. AI 建议列表渲染（汇集本周每日建议）。
5. 周切换可查看不同周（prev/next）。
6. `next build` 成功；前端 tsc 0 错；vitest（纯逻辑）全绿；BDD/E2E 覆盖趋势图渲染 + 弱项下钻；四道质量门 PASSED。

**关键文件**

新增：`server/src/ai/...`(仅改 controller+spec)、`src/lib/weekly.ts`、`src/lib/weekly.spec.ts`、`src/components/TrendChart.tsx`、`src/app/parent-report/page.tsx`、`src/e2e/features/parent-report.feature`、`src/e2e/support/pages/parent-report.ts`、`src/e2e/step-definitions/parent-report.steps.ts`、`features/ai-507.md`、`docs/quality/ai-507-gate.md`。
修改：`src/lib/types.ts`、`src/lib/api.ts`、`src/components/TabNav.tsx`、`src/app/practice/page.tsx`、`server/src/ai/ai-weekly-report.controller.ts`、`server/src/ai/ai-weekly-report.controller.spec.ts`、`features/backlog.md`。

**测试与质量门**

**6.1 单元测试（vitest，纯逻辑）**

- `lib/weekly.spec.ts`：`mondayOfWeekUTC` / `addDaysUTC` / `weekEndOf`（含跨周/跨月/跨年边界）。
- （后端）`ai-weekly-report.controller.spec.ts`：`preview` 透传 `buildWeeklyReport`、缺 `userId` → 400。


---
