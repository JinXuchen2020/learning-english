# AI-204 质量门报告

> 分支: feat/ai-204 | 栈: node-ts | 日期: 2026-08-05

## 实现摘要
为 `POST /api/ai/plan/generate` 增加**输出可靠性**三层防护：

1. **Schema 校验** `plan-schema.ts`：`validatePlan(raw)` 递归校验根对象 → `weeks[]` 非空 → 每周含数字 `week` + `days[]` 非空 → 每日含数字 `day` + `lessons[]` 非空 → 每节为对象；并对 `lesson.type`/`skillType`/`title`/`courseId`/`lessonId` 做格式校验（若携带）。错误**聚合**一次性返回。
2. **自动重试** `PlanService.generatePlan`：校验失败（含 JSON 解析失败）自动重试，最多 `MAX_PLAN_ATTEMPTS=3` 次；重试请求附 `retryNote` 自我纠正。
3. **模板降级** `plan-template.ts`：`buildFallbackPlan(dto)` 产出结构合规（经 `validatePlan` 通过）、不依赖 LLM/目录的最小周计划（每天 1 main + 2 review + 1 speaking，技能按 vocab/listen/speak/write 循环交错）。重试耗尽 → 返回该模板，`degraded:true`、`model:'template'`。

**重试边界（硬约束）**：仅「输出校验失败」重试；`AiProvider.chat` 抛出的基础设施异常**向上传播**，不在本层重试（避免与 AI-106 的 HTTP 层 3 次退避叠加成 9 次）。

**与 AI-205 分工**：本 feature 的 `buildFallbackPlan` 是紧急降级安全网；AI-205 才是「3 套按 dailyMinutes 档位的静态周计划 + 用户可选模板生成」入口，二者不冲突。

## 质量门结论（四道通用门）

### 1. 一致性门 (consistency) — PASSED
- `tsc --noEmit` 0 错误。
- `jest` **281/281 全绿**（AI-203 为 254，+27 来自 5 个 plan 测试文件）。
- 复用 AI-202 接口契约（`POST /api/ai/plan/generate` → `GeneratePlanResponse`），仅升级 `degraded` 语义（模板降级），无字段/路由破坏，前端契约向后兼容。纯后端无全栈契约漂移。

### 2. 测试门 (tests) — PASSED
单元测试 **5 文件**：
- `plan-schema.spec.ts`（14 cases）：根类型 / weeks·days·lessons 必填与非空 / type·skillType 枚举 / title 类型 / courseId·lessonId 非空 / 多层级错误聚合 / 常量。
- `plan-template.spec.ts`（7 cases）：产出经 `validatePlan().ok`、周数映射、每日 4 节结构、技能交错、主题融合兴趣、weeks 越界收敛、不引用真实 id。
- `plan.service.spec.ts`（重写 9 cases）：合法 JSON 首轮通过且 chat 仅 1 次、Markdown 围栏、非 JSON → 重试 3 次后降级模板（chat 计 3 次 + degraded + weeks 有效）、坏 Schema → 降级模板、坏 JSON 第 1 次合法第 2 次 → 第 2 次成功、重试请求带 retryNote、provider 异常传播、user payload + temperature、system=双语提示词、learnerProfile+catalogNote。
- `plan.controller.spec.ts`（更新 1）：默认 provider JSON 改为合规以保持控制器绿。
- `plan-agent.prompt.spec.ts`（新增 4）：attempt=1 无 retryNote、attempt>1 附 retryNote、有目录时 retryNote 强调目录约束。

BDD/E2E：**0 场景**——纯后端输出可靠性增强，无新 UI/路由；按约束 #6（不为纯后端 API 写 BDD）+ AI-201/202/203 先例豁免。`/plan` 页端到端旅程由 AI-207/208 自带。

### 3. 代码审查门 (review) — PASSED (0 open)
- **空安全**：空 `weeks`/`days`/`lessons` 均显式校验，遍历前判数组；`extractJson` 空串早返。
- **错误处理**：provider 异常传播路径显式保留（断言不重试）；校验失败 `continue` 进入重试，不吞异常。
- **边界**：`weeks` 越界（0/99）在模板层收敛为 [1,8]；重试计数常量化（无魔法值）。
- **死代码/魔法值**：移除旧 `rawText` 兜底分支（仅保留类型字段兼容）；`MAX_PLAN_ATTEMPTS` 提取为静态常量。
- **注入/安全**：用户输入经 DTO 校验后才进提示词；模板不编造 id（存在性校验属 AI-206）。
- **类型契约**：`PlanWeek` 增加 `theme?` 贴合提示词输出；`PlanLevel` 正确从 DTO 导入。

### 4. 优化门 (optimization) — PASSED (0 open)
- `plan-schema` / `plan-template` 单一职责，纯函数可单测。
- 移除 AI-202 遗留的 `rawText` 降级分支，`degraded` 语义统一为「模板降级」并同步 `plan.types.ts` 文档。
- 无临时调试代码、无未用导出。

## 遗留风险
- **id 存在性校验**：`validatePlan` 仅做格式校验（非空字符串），不校验 `courseId/lessonId` 是否真实存在于 `courses`/`lessons` 表——目录注入与存在性校验随 AI-206。
- **模板丰富度**：`buildFallbackPlan` 为最小合规结构（不含真实 id、标题偏模板化）；AI-205 将提供 3 套按 `dailyMinutes` 档位的静态周计划 + 用户可选模板生成入口。
- **内容安全双保险**（关键词黑名单 + 安全模型）属 AI-406，未在本 feature 范围。
