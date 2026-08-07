# M2 — AI 学习计划生成 (W2)

> 本里程碑共 **9** 个 feature，均已 `done`。


| ID | Feature | 优先级 | 依赖 |
|---|---|---|---|
| AI-201 | `study_plans` / `study_plan_days` 实体 | P0 | — |
| AI-202 | 生成接口 `POST /api/ai/plan/generate` | P0 | AI-106, AI-201 |
| AI-203 | PlanAgent System Prompt | P0 | AI-102 |
| AI-204 | Plan JSON Schema 校验与重试 | P0 | AI-202, AI-203 |
| AI-205 | 内置模板计划 | P0 | AI-201 |
| AI-206 | 计划持久化与"应用计划" | P0 | AI-201, 现有 TasksModule |
| AI-207 | `/plan` 页面 — 向导表单 | P0 | AI-202 |
| AI-208 | `/plan` 页面 — 计划展示与交互 | P0 | AI-206, AI-207 |
| AI-209 | 计划进度回写 | P1 | AI-206, 现有 ProgressModule |

---

## AI-201 — `study_plans` / `study_plan_days` 实体

> 优先级 **P0** · 依赖 — · 状态 done

**目标**

为 M2「AI 学习计划生成」落地**数据底座**：建立 `study_plans`（计划头）与 `study_plan_days`（按天计划）两张表，并与 `User` 关联；定义 `skill_type`（`vocab`/`listen`/`speak`/`write`）与 `status`（`draft`/`applied`/`archived`）枚举。后续 AI-202（生成接口）、AI-206（应用计划落库 `tasks`）、AI-208（计划展示）、AI-209（进度回写）将直接消费本 feature 的实体与 `PlanModule` 仓库。

**验收标准**

- [ ] `study_plans` / `study_plan_days` 两张表由 `synchronize` 自动建立（本地 `npm run seed` 验证 `DataSource.initialize` 不抛错）。
- [ ] `StudyPlan` 与 `User` 关联（cascade 删除）；`StudyPlanDay` 与 `StudyPlan` 关联（cascade 删除）。
- [ ] `skillType` / `status` 枚举值正确（`vocab`/`listen`/`speak`/`write`；`draft`/`applied`/`archived`）。
- [ ] `status` 默认 `draft`，`isDone` 默认 `false`。
- [ ] 覆盖率：新增实体被单测覆盖（元数据回调 + in-memory DB 行为：建表/默认值/关系/枚举）；实体无逻辑分支，无遗留未覆盖行为。
- [ ] `nest build` / `tsc` 0 错误；jest 全绿（全局 90/70 基线不退化）；pre-commit 质量门强执通过。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（实体无逻辑分支，覆盖元数据 + 行为建表证据）**

- `entities.metadata.spec.ts`（修改）：导入 `StudyPlan`/`StudyPlanDay`，断言实体数 8→10，关系回调可调用（ManyToOne/OneToMany 箭头被触发）。
- `plan.module.spec.ts`（新增）：`TypeOrmModule.forRoot` in-memory better-sqlite3 + `appEntities` + `PlanModule`：
  - 保存 `User` + `StudyPlan`（不显式传 status）→ 读回 `status === 'draft'`（默认值）。
  - 保存 `StudyPlanDay`（含 `planId`）→ 经关系/直接读取，验证 `isDone === false` 默认、`skillType` 落地。
  - `cascade` 保存 `StudyPlan` 带 `days` → 子行自动落库且 `planId` 自动填充。
  - 断言 `STUDY_PLAN_SKILL_TYPES` / `STUDY_PLAN_STATUSES` 内容正确（枚举完整性）。

**7. 质量门（Phase 4 嵌入）**

- consistency: `nest build`/`tsc` 0 错误；jest 全绿；`npm run seed` 建表成功；纯后端无全栈契约。
- tests: 单元测试 2 文件（metadata 修改 + plan.module 行为）全绿；BDD/E2E 0（纯后端豁免，无 legacy 豁免需求——实体无分支逻辑）。
- review: 0 open（空安全/枚举可移植/级联删除/时间列铁律/无裸 console/与现有实体风格一致）。
- optimization: 0 open（无 stub/占位；常量数组复用；无临时调试）。


---

## AI-202 — 生成接口 `POST /api/ai/plan/generate`

> 优先级 **P0** · 依赖 AI-106, AI-201 · 状态 done

**目标**

为 M2 学习计划提供首个可调用后端接口：前端（AI-207 向导页）提交孩子的年龄/等级/每日时长/兴趣/周数，
后端调用 `AiProvider.chat` 生成结构化学习计划 JSON 并返回（**不落库**——落库与应用由 AI-206 负责）。
无 key（`AI_PROVIDER=mock`）时仍可返回可用结果，保证 AI-104「无 key 全流程演示」契约。

**验收标准**

- [ ] `POST /api/ai/plan/generate` 合法入参 → 返回 `GeneratePlanResponse`（plan 为结构化 JSON，`degraded:false`）。
- [ ] 非法入参（缺字段/类型错误/越界）→ 被全局 `ValidationPipe`(class-validator) 拦截返回 400。
- [ ] `AI_PROVIDER=mock` 时（返回演示文本）接口仍 200，`degraded:true` + `plan.rawText` 兜底。
- [ ] `PlanModule` 注册进 `AppModule`，路由真实可达。
- [ ] 单元测试覆盖：DTO 校验规则、Service 解析成功/非 JSON 兜底/provider 异常传播、Controller 路由+DTO 装配。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（覆盖有逻辑分支的源码）**

- `generate-plan.dto.spec.ts`：逐一验证各字段合法/非法（UUID/ageRange 正则/level 枚举/数值边界/interests 数组）必中 class-validator。
- `plan.service.spec.ts`：① provider 返回合法 JSON → `degraded:false` 且 `plan.weeks` 透传；② provider 返回非 JSON 文本 → `degraded:true` + `plan.rawText`；③ provider `chat` 抛错 → 异常向上传播（AI-106 重试/配额在外层）。
- `plan.controller.spec.ts`：经 TestingModule 装配 `PlanController` + mock `AI_PROVIDER_TOKEN`；合法 body 调 `generate` 返回结构化响应；非法 body 经 `ValidationPipe` transform 抛 `BadRequestException`（等价 400）。
- 更新 `plan.module.spec.ts`：原仅测建表，`PlanModule` 现含注入全局 `AI_PROVIDER_TOKEN` 的 `PlanService`，需在测试模块补 mock provider 避免 Nest 依赖解析失败。

**7. 质量门（Phase 4 嵌入）**

- consistency: tsc --noEmit 0 错误；jest 全绿；AppModule 装配后路由可达。
- tests: unit 4 文件（含更新）全绿；e2e/bdd 0（纯后端豁免，见 §6）。
- review: 0 open（边界/空安全/异常传播/注入安全/Magic 值提取至常量）。
- optimization: 0 open（占位 prompt 已注释待 AI-203；无临时调试代码）。


---

## AI-203 — PlanAgent System Prompt

> 优先级 **P0** · 依赖 AI-102 · 状态 done

**目标**

把 AI-202 的「最小可运行占位提示词」替换为生产级 **PlanAgent System Prompt**：
中文语境 + 英文学习材料、儿科友好、内容安全红线、结构化日计划（1 主课 + 2 复习 + 1 口语）、
间隔复习、技能交错（vocab/listen/speak/write）、要求引用真实 `courseId`/`lessonId`。
让 LLM 产出可被 AI-204（Schema 校验）/ AI-206（落库映射任务）消费的语义正确计划。

用户价值：计划更贴合儿童认知、内容安全可控、且能对齐平台真实课程目录（不编造 id）。

**验收标准**

- [x] 提示词含全部 8 项核心要素（单元测试断言）。
- [x] 提示词为双语（含中英文关键词）。
- [ ] 输出引用真实 `courseId`/`lessonId`（需 AI-204 注入目录 + 校验真正闭环；AI-203 仅把指令与承载字段就位）。
- [ ] 无超龄/危险内容（内容安全红线在提示词中确立；双保险关键词/模型过滤属 AI-406）。
- [x] `tsc --noEmit` 0 错误；`jest` 全绿；`POST /api/ai/plan/generate` 行为回归（mock 仍降级 200）。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（仅覆盖有逻辑分支的源码；前端仅纯逻辑模块，纯展示型组件不强制）**

- `plan-agent.prompt.spec.ts`：
  - 提示词非空；含双语标记（中 + 英）；含安全红线（超龄/暴力/危险/不当价值观等关键词）；
    含日结构（1 主课 + 2 复习 + 1 口语）；含间隔复习；含技能交错（vocab/listen/speak/write 四类）；
    含「仅 JSON」指令；含引用真实 courseId/lessonId 指令；含低 temperature 重申。
  - `buildPlanUserPrompt(dto)`（无目录）：含 dto 全部字段且不含目录段。
  - `buildPlanUserPrompt(dto, catalog)`（有目录）：含目录课程/课时数且含「必须引用真实 id」约束文案。
- 更新 `plan.service.spec.ts`：断言 `generatePlan` 发出的 system 消息即双语提示词常量（防回退占位）。

**7. 质量门（Phase 4 嵌入）**

- consistency: PASSED（tsc 0 错误；jest 全绿；复用 AI-202 接口契约无漂移）
- tests: PASSED（unit: 1 新文件 + 更新 1 文件；e2e/bdd: 0 场景，纯后端提示词豁免）
- review: PASSED（0 open；无裸 console、无死代码、目录注入留待后续）
- optimization: PASSED（0 open；清除 AI-202 占位提示词，替换为生产提示词）


---

## AI-204 — Plan JSON Schema 校验与重试

> 优先级 **P0** · 依赖 AI-202, AI-203 · 状态 done

**目标**

让 `POST /api/ai/plan/generate` 的输出**可靠**：LLM 有时返回残缺/非 JSON/结构不符的计划。AI-204 在 `PlanService` 内增加结构化 Schema 校验 + 自动重试（≤3 次）+ 兜底内置模板计划，保证前端永远拿到「要么合规、要么明确 degraded 的模板」，不再出现 `rawText` 半成品。

**验收标准**

- [ ] `validatePlan(raw)` 对合规计划返回 `ok:true`；对根非对象 / weeks 缺失或空 / days 缺失或空 / lessons 缺失或空 / lesson.type 非法 / lesson.skillType 非法 / lesson.courseId|lessonId 非空字符串校验 等场景返回 `ok:false` 并聚合错误。
- [ ] 构造坏 JSON（无法 parse / 结构不符）→ 服务自动重试 ≤3 次；3 次后仍不合规 → 返回模板计划且 `degraded:true`、`model:'template'`、`plan.weeks` 有效。
- [ ] 合法 JSON 首轮即通过，`chat` 仅调用 1 次，`degraded:false`。
- [ ] provider 抛错（基础设施异常）仍向上传播（重试交由 AI-106 的 HTTP 层处理，避免双重重试），不进入模板降级。
- [ ] 内置模板计划 `buildFallbackPlan(dto)` 产出 `validatePlan().ok===true` 的结构（按 `weeks` 周数、每天含 main+review+speaking 任务），不依赖 LLM / 目录。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（覆盖有逻辑分支源码）**

- `plan-schema.spec.ts`：`validatePlan` 正常/边界/异常（根类型、weeks/days/lessons 必填与非空、type/skillType 枚举、courseId/lessonId 格式、错误聚合）。
- `plan-template.spec.ts`：`buildFallbackPlan` 产出结构通过 `validatePlan`；周数映射、每日含 main/review/speaking。
- `plan.service.spec.ts`（更新）：合法 JSON 首轮通过且 chat 仅 1 次；非 JSON / 坏 schema → 重试 3 次后降级模板（chat 计 3 次、degraded、weeks 有效）；provider 抛错传播；重试请求带 `retryNote`；system=双语提示词、user=learnerProfile 不变。
- `plan.controller.spec.ts`（更新）：默认 provider JSON 改为合规，保持控制器绿。
- `plan-agent.prompt.spec.ts`（更新）：`buildPlanUserPrompt(dto, catalog, attempt>1)` 追加 `retryNote`。

**7. 质量门（Phase 4 嵌入）**

- consistency: tsc 0 错误；jest 全绿；复用 AI-202 接口契约无漂移。
- tests: 单元测试 5 文件全绿；BDD/E2E 0（纯后端豁免）。
- review: 0 open（重试边界/空安全/错误聚合/无魔法值）。
- optimization: 0 open（移除旧 rawText 兜底分支、常量提取 MAX_PLAN_ATTEMPTS）。


---

## AI-205 — 内置模板计划

> 优先级 **P0** · 依赖 AI-201 · 状态 done

**目标**

把 AI-204 的「单一最小兜底模板」升级为 **3 套按 `dailyMinutes` 档位的静态周计划**，并开放「用户主动选模板、不走 LLM」的生成路径。让应用在**无 LLM key / key 不可用**时，仍能产出结构合规、可渲染、且随每日时长自适应的学习计划（降级安全网 + 主动选模板双通道）。

用户价值：无网络/无 key 环境下，家长与孩子也能直接拿到一份合理计划；每日时长越长，复习密度越高。

**验收标准**

- [ ] `resolveTier(5|15)='short'`, `resolveTier(16|45)='standard'`, `resolveTier(46|120)='extended'`
- [ ] `buildFallbackPlan` 按 `dailyMinutes` 选档：short→每日 2 节、standard→4 节、extended→5 节
- [ ] 三档产出均通过 `validatePlan`（ok:true），可安全渲染
- [ ] `dto.useTemplate=true` 时 `generatePlan` 不调用 `AiProvider.chat`，直接返回 `model:'template', degraded:false`
- [ ] `dto.useTemplate` 缺省时行为不变（照常走 LLM + 重试 + 降级）
- [ ] `useTemplate` 非布尔被 class-validator 拦截（400）

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（覆盖有逻辑分支源码）**

- `plan-template.spec.ts`：tier 边界解析；三档每日 lesson 数量与 type/skillType 序列；三档均过 `validatePlan`；主题/技能循环不变；weeks 边界收敛；无真实 id。
- `plan.service.spec.ts`：`useTemplate=true` 跳过 LLM 直出模板（degraded:false, model:'template', chat 0 调用）；缺省路径不变（复用 AI-204 用例）。
- `generate-plan.dto.spec.ts`：`useTemplate` 布尔校验（缺省零错；非布尔被拒）。

**7. 质量门（Phase 4 嵌入）**

- consistency: tsc --noEmit 0 错；jest plan 相关全绿；DTO/响应字段契约对齐。
- tests: unit 3 文件全绿；e2e/bdd 按约定豁免（纯后端 API）。
- review: 0 open（边界/空安全/无裸 console）。
- optimization: 0 open（无 stub/调试残留，常量提取档位边界）。


---

## AI-206 — 计划持久化与"应用计划"

> 优先级 **P0** · 依赖 AI-201, 现有 TasksModule · 状态 done

**目标**

把 AI-202 生成的「内存计划」落库为可复用的 `StudyPlan` 草稿，并提供「应用计划」接口：
将计划置为 `applied`，按天把计划任务写入现有 `daily_tasks` 表，使孩子首页「每日任务列表」出现对应任务。
支持「重复应用提示确认」，避免误覆盖。

**验收标准**

- [ ] `save` 合法 plan → 落库 draft + 返回 id；非法 plan → 400。
- [ ] `apply` 找不到 → 404；draft → 置 applied + daily_tasks 出现该用户当日任务。
- [ ] `apply` 已 applied 且未 confirm → 409 needsConfirm；confirm=true → 重应用（任务先清后写，无重复）。
- [ ] `getDailyTasks(userId)` 返回「全局种子 + 该用户当日计划任务」，完成态仍正确。
- [ ] 多用户隔离：A 的计划任务不出现在 B 的列表。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（覆盖逻辑分支源码）**

- `plan.service.spec`：savePlan 落库草稿返回 id / 非法 plan 抛 BadRequest；applyPlan 404 / draft→applied+tasksCreated / 已applied未confirm→Conflict(needsConfirm) / confirm=true→重应用(replacePlanTasks 被调用, 无重复)。
- `tasks.service.spec`：getDailyTasks 合并全局+当日计划任务；replacePlanTasks 先删后插（mock repo 断言 delete/save 调用）。
- `save-plan.dto.spec` / `apply-plan.dto.spec`：childId uuid 校验、plan 必填对象、confirm 布尔。

**7. 质量门（Phase 4 嵌入）**

- consistency: tsc --noEmit 0 错；jest plan+tasks 全绿；契约对齐（save/apply/GeneratePlanResponse 不变）。
- tests: unit 4 文件全绿；e2e/bdd 0（legacy/纯后端豁免，标注）。
- review: 0 open（多租户隔离、空安全、异常映射、魔法值提取）。
- optimization: 0 open（无 stub、无裸 console、复用 AI-204 validatePlan）。


---

## AI-207 — `/plan` 页面 — 向导表单

> 优先级 **P0** · 依赖 AI-202 · 状态 done

**目标**

为已登录的孩子提供一页式「学习计划向导」：用大触控目标的卡片选择器收集
年龄段 / 等级 / 每日时长 / 兴趣 / 周数，提交后调用 `POST /api/ai/plan/generate`
得到计划，并就地给出基础预览（含「模板兜底」`degraded` 提示与错误态）。
让 `/plan` 成为 M2 学习计划闭环的真实入口。

**验收标准**

- [ ] 已登录用户访问 `/plan` 看到完整向导（5 组选择器 + 提交按钮）。
- [ ] 空表单时提交按钮禁用；填写完整后启用。
- [ ] 提交调用 generate 接口，loading → 预览渲染出 weeks/days/lessons。
- [ ] 无 key 环境降级返回仍正确渲染预览并提示 `degraded`。
- [ ] 接口报错时显示错误提示而非白屏。
- [ ] 表单校验逻辑有单元测试覆盖（正常/各字段缺失）。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（vitest，覆盖纯逻辑模块）**

- `lib/plan.spec.ts`：`validatePlanForm` 覆盖——全空 / 缺 ageRange / 缺 level /
  缺 dailyMinutes / 空 interests / 缺 weeks / 全合法 → 对应 errors 与 isPlanFormValid。
- `lib/api.spec.ts`：新增 `generatePlan` mock fetch 成功解析与失败抛 `ApiError`。

**7. 质量门（Phase 4 嵌入）**

- consistency: tsc --noEmit 0 错；next 构建/类型通过；前后端字段对齐（GeneratePlanDto↔前端类型）。
- tests: unit 2 文件全绿；e2e 2 scenarios 跑通（免 key 经 MockProvider 降级）。
- review: 0 open（空安全、错误回退、无 magic value、data-component 钩子一致）。
- optimization: 0 open（无 stub/调试残留、常量提取、统一错误展示）。


---

## AI-208 — `/plan` 页面 — 计划展示与交互

> 优先级 **P0** · 依赖 AI-206, AI-207 · 状态 done

**目标**

在 AI-207 的向导 + 基础预览之上，把 `/plan` 升级为真正的「计划展示与交互」页：生成后呈现
**每日颜色化的周计划卡片**，提供「重新生成」(带 loading + 模板降级提示) 与「应用此计划」
(调 save→apply→跳转 Home 并在每日任务看到新任务) 两个动作，并支持**单日任务勾选**（本地视觉态，
持久化属 AI-209）。让 M2 学习计划闭环的「生成 → 查看 → 应用」完成。

**验收标准**

- [ ] 生成后看到每日颜色化的周计划卡片（按技能类型上色）。
- [ ] 「重新生成」可重新生成计划（loading + 降级提示保留）。
- [ ] 「应用此计划」调 save→apply，成功后跳转 Home，Home 每日任务出现新计划任务。
- [ ] 单日任务可勾选（本地视觉完成态）。
- [ ] 应用失败（如网络/后端错误）显示错误提示而非白屏。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（vitest，覆盖纯逻辑模块）**

- `lib/plan.spec.ts` 扩展：`planSkillColor`（vocab/listen/speak/write 各自颜色 + undefined 兜底）/ `formatPlanDay`（标题兜底 `第 N 天` + lessonCount 计算 + skills 提取）。
- `lib/api.spec.ts` 扩展：`savePlan` 成功 POST `/api/ai/plan/save` 返回 `{id,status}`；`applyPlan` 成功 POST `/api/ai/plan/:id/apply` 返回应用结果；400/409 → 抛 `ApiError`。

**7. 质量门（Phase 4 嵌入）**

- consistency: tsc --noEmit 0 错；next 构建通过；前后端字段对齐（SavePlanResponse/ApplyPlanResponse↔前端类型）。
- tests: unit（plan.spec 扩展 + api.spec 扩展）全绿；e2e（plan-display.feature 场景）跑通（免 key 经 MockProvider 降级）。
- review: 0 open（空安全 result?.plan?.weeks、apply 错误回退、无 magic value、data-component 钩子一致）。
- optimization: 0 open（无 stub/调试残留、颜色/格式化逻辑集中 lib/plan.ts、统一错误展示）。


---

## AI-209 — 计划进度回写

> 优先级 **P1** · 依赖 AI-206, 现有 ProgressModule · 状态 done

**目标**

把 M2 学习计划闭环的最后一块补上：孩子**完成计划内的每日任务**时，后端把对应
`study_plan_days.isDone` 回写为 `true`；Home 页据此展示**计划完成度**（已完成 X / 总 Y 天 +
进度环），让孩子看到自己的学习节奏。后端零新增数据模型（复用 AI-201 的 `study_plan_days.isDone` 与
AI-206 的 `daily_tasks.planDayId` 关联）。

**验收标准**

- [ ] 完成 planDayId 非空的每日任务 → 对应 `study_plan_days.isDone` 置 true（幂等）。
- [ ] 完成全局种子任务（planDayId 空）不影响任何计划日。
- [ ] 无 applied 计划时 `/api/ai/plan/status` 返回 `hasPlan:false`，Home 不显示完成度卡。
- [ ] 有 applied 计划时 Home 显示完成度卡（X/Y 天 + 进度环）。
- [ ] 在 Home 完成计划任务后，完成度卡的数字/进度环随之更新。

**关键文件**

（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）

**测试与质量门**

**单元测试（vitest / jest，覆盖有逻辑分支的源码）**

- 后端 `tasks.service.spec.ts` 扩展：completeTask 对 plan 任务回写 `isDone`（mock `dayRepo.update` 断言被调用且条件正确）/
  对全局种子任务（planDayId 空）不回写 / 已完成幂等仍回写（无异常）；`plan.service.spec.ts` 扩展：getStatus 有 applied 计划
  返回正确 total/done/ratio / 无 applied 计划返回 hasPlan:false。
- 前端 `lib/api.spec.ts` 扩展：`getPlanStatus` 成功解析 `{hasPlan,totalDays,doneDays,completionRatio}` / 无计划返回 hasPlan:false。

**7. 质量门（Phase 4 嵌入）**

- consistency: tsc --noEmit 0 错；next 构建通过；前后端字段对齐（PlanStatusResponse ↔ 后端 PlanStatusResult）。
- tests: unit（tasks.service.spec 回写分支 + plan.service.spec getStatus + api.spec getPlanStatus）全绿；e2e（plan-progress.feature 2 scenarios）跑通。
- review: 0 open（空安全 hasPlan/plan 可能空；回写幂等；无 magic value；data-component 钩子一致 PlanProgress）。
- optimization: 0 open（无 stub/调试残留；回写逻辑集中 completeTask；统一错误展示）。


---
