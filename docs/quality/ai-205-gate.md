# AI-205 质量门报告

> 分支: feat/ai-205 | 栈: node-ts (NestJS + TypeORM) | 日期: 2026-08-05
> 来源 feature: features/ai-205.md

## 交付摘要
AI-205 把 AI-204 的「单一最小兜底模板」升级为 **3 套按 `dailyMinutes` 档位的静态周计划**，并新增「用户主动选模板、不走 LLM」的生成路径：

- `server/src/plan/plan-template.ts`
  - 新增 `PlanTier` 类型与 `resolveTier(dailyMinutes)`（`TIER_SHORT_MAX=15` / `TIER_STANDARD_MAX=45` 边界常量）。
  - 三档每日 lesson 结构：`short`(≤15min, 2 节) / `standard`(16-45min, 4 节) / `extended`(≥46min, 5 节)；主课随四技能日循环，复习/口语按档位补齐。
  - `buildFallbackPlan(dto)` 现按 `dailyMinutes` 选档，向后兼容 AI-204 的 standard 默认结构（dailyMinutes 缺省 20）。
- `server/src/plan/dto/generate-plan.dto.ts`：新增可选 `useTemplate?: boolean`（`@IsOptional() @IsBoolean()`）。
- `server/src/plan/plan.service.ts`：`generatePlan` 在 `useTemplate===true` 时跳过 `AiProvider.chat`，直出模板（`model:'template'`, `degraded:false`），无 LLM 依赖。

## 一致性门（consistency）
- `tsc --noEmit`：**0 错误**。
- `jest`（server 全量）：全绿（plan 模块 74 cases + 其余模块稳定）。
- 契约：复用 `POST /api/ai/plan/generate` 与 `GeneratePlanResponse`，仅新增可选 body 字段 `useTemplate`，响应契约不变；前端可据 `model==='template'` 区分降级/主动模板。纯后端，无全栈契约漂移。
- 向后兼容：AI-204 降级路径（`degraded:true, model:'template'`）与既有单测完全保留（standard 档即原 4 节结构）。

## 测试门（tests）
- 单元测试文件数：**3 文件新增/更新**（逻辑分支覆盖）
  - `plan-template.spec.ts`：tier 边界解析 + 三档 lesson 数量/type/skillType 序列 + 三档均过 `validatePlan` + 档位随 dailyMinutes 递增 + extended 含 write 复习；保留 AI-204 全部断言。
  - `plan.service.spec.ts`：新增 `useTemplate=true` 跳过 LLM（chat 0 调用, degraded:false, model:template）+ `useTemplate=false/缺省` 仍走 LLM。
  - `generate-plan.dto.spec.ts`：新增 `useTemplate` 布尔校验（缺省零错、非布尔被拒）。
- E2E/BDD：**0 场景**，按项目约定 #6 纯后端 API 路径豁免（无前端 UI 旅程；`/plan` 页旅程属 AI-207/208）。

## 代码审查门（review）
- 0 open。
- 边界：`dailyMinutes` 已受 class-validator [5,120] 约束，`resolveTier` 对边界值（≤15/≤45/else）明确三分支；档位常量提取，无魔法值。
- 空安全：主题词 `interests` 空数组回退 `'动物'`；weeks 越界收敛。
- 错误处理：provider 异常传播逻辑未改动（AI-204 已明确不叠加 AI-106）；useTemplate 提前返回不影响重试/降级。
- 无裸 `console`（`Logger` 仅 `log`/`warn`）；无死代码；`REVIEW_SLOTS`/`SKILL_CYCLE` 单一职责提取。

## 优化门（optimization）
- 0 open。
- 无 stub/占位残留；档位边界、`DAYS_PER_WEEK` 等常量提取；`lessonsForTier` 用 `switch` 显式三分支，无隐式默认。
- 文档同步：`docs/ai-integration.md` 已补 `useTemplate` 字段与 AI-205 三档说明；backlog 状态标 `done`。

## 遗留风险
- 前端表单文档仅列 10/20/30min，经 UI 仅能触发 short(10) 与 standard(20/30)，extended(≥46) 需更长时长或未来扩展表单——属后端能力覆盖全 [5,120] 范围，可接受。
- 真实 `courseId/lessonId` 引用与目录注入仍属 AI-206，本 feature 不引用真实 id。
