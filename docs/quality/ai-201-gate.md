# AI-201 质量报告 — 学习计划数据模型（实体 + 建表）

> 栈: node-ts (NestJS 10 + TypeORM, better-sqlite3 / postgres 双驱动)
> 分支: feat/ai-201（基于 feat/ai-108）
> 日期: 2026-08-05

## 实现摘要

为 M2「AI 学习计划生成」落地数据底座：

- **`StudyPlan`**（`study_plans` 表，计划头）：`ManyToOne(User)` + `@Column userId`（index, `onDelete: 'CASCADE'`，与 `lesson_progress`/`word_progress`/`task_completion` 风格一致）；`skillType`(varchar 16)、`status`(varchar 16, 默认 `draft`)；`OneToMany(StudyPlanDay, { cascade: true })`；`createdAt`/`updatedAt`。
- **`StudyPlanDay`**（`study_plan_days` 表，按天明细）：`ManyToOne(StudyPlan)` + `@Column planId`（index, `onDelete: 'CASCADE'`）；`dayIndex`(int)、`date`(varchar 10, 可空)、`skillType`、`title`、`content`(text)、`isDone`(boolean, 默认 false)；时间列同上。
- 导出 `STUDY_PLAN_SKILL_TYPES` / `STUDY_PLAN_STATUSES` 常量数组 + 联合类型，供 AI-202+ DTO/校验复用。
- **`PlanModule`**：`TypeOrmModule.forFeature([StudyPlan, StudyPlanDay])` 并导出 `TypeOrmModule`，作为后续 feature 注入仓库的注册点。
- 两实体注册进 `config/database.config.ts` 的 `appEntities`（`synchronize` 自动建表，与 AI-107/108 一致）。
- `User` 增加反向 `@OneToMany studyPlans`（与既有进度实体关联风格一致）。

## 四道质量门

### 1. 一致性门（consistency） — PASSED
- `tsc --noEmit` 0 错误；`nest build` 通过。
- `jest` 全绿：223/223（较 AI-108 的 218 增加 5，来自本 feature）。
- `npm run seed` 成功：`DataSource.initialize` + `synchronize` 未抛 `DataTypeNotSupportedError`；实测 `study_plans` / `study_plan_days` 表与列均已落库（见下方验证）。
- 纯后端数据模型，无前端，无全栈契约需对齐。

### 2. 测试门（tests） — PASSED
- **单元测试 2 文件**：
  - `src/plan/plan.module.spec.ts`（新增，5 cases）：in-memory better-sqlite3 + 真实 `appEntities` 验证——建表成功、`status` 默认 `draft`、`isDone` 默认 false、关系/级联保存与级联删除、`STUDY_PLAN_SKILL_TYPES`/`STUDY_PLAN_STATUSES` 枚举完整性。
  - `src/entities/entities.metadata.spec.ts`（更新）：导入 `StudyPlan`/`StudyPlanDay`，断言实体数 8→10，关系回调可调用。
- **BDD/E2E：0** — 纯后端数据模型，无前端 UI 旅程，约束 #6「不为纯后端 API 写 BDD」豁免；非 legacy 豁免（实体无分支逻辑，无未覆盖行为）。

### 3. 代码审查门（review） — PASSED（0 open）
- 空安全：实体字段均有合理默认值；关系回调走 `() =>` 惰性引用，无运行期崩溃点。
- 枚举可移植：`varchar` + TS 联合类型（与 `AiCallLog.status` 同口径），不用 DB 原生 enum，sqlite/postgres 双驱动兼容。
- 时间列铁律：一律 `@CreateDateColumn()` / `@UpdateDateColumn()`，未使用 `@Column({ type: 'timestamp' })`（AI-107 踩坑规避）。
- 级联删除：`onDelete: 'CASCADE'` 与现有进度实体一致，删用户/计划时子行清理。
- 关联一致性：`User.studyPlans` 反向 OneToMany 与 `StudyPlan.user` 对应。
- 无裸 `console.*`；与现有 `entities/*.entity.ts` 风格一致。

### 4. 优化门（optimization） — PASSED（0 open）
- 无 stub / 占位实现；无临时调试代码。
- 枚举合法值提取为常量数组复用，避免魔法字符串散落。
- `PlanModule` 仅做 `forFeature` 注册并导出 `TypeOrmModule`，无冗余导出。

## 建表验证（实测）

```
tables found: [{"name":"study_plan_days"},{"name":"study_plans"}]
study_plans cols: id,userId,skillType,status,createdAt,updatedAt
study_plan_days cols: id,planId,dayIndex,date,skillType,title,content,isDone,createdAt,updatedAt
```

## 遗留 / 后续
- 本 feature 仅建表 + 实体 + 模块注册；生成（AI-202）、应用落库（AI-206）、展示（AI-208）、进度回写（AI-209）复用本实体与 `PlanModule` 仓库。
- `docs/ai-integration.md` 中 `study_plan_days` 旧描述含 `course_id`/`lesson_id`，已在本 feature 文档同步中修正为实际落地 schema（具体课程/课时关联留待 AI-206 详细设计）。
