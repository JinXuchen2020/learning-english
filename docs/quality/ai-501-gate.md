# AI-501 质量报告 — 每日 AI 报告数据模型

> 分支: feat/ai-501 | 栈: node-ts (NestJS 10 + TypeORM, better-sqlite3 / postgres 双驱动)
> 质量门: consistency + tests + review + optimization 全 PASSED（cleared:true, enforced:true）

## 交付内容

- 新增 `server/src/ai/ai-report.entity.ts`：`AiReport` 实体 → 表 `ai_reports`
  - 字段：`id`(uuid PK)、`userId`(varchar 255, index)、`date`(varchar 10, index)、
    `summaryText`(text, default '')、`weakWords`(simple-array, default '')、`suggestionText`(text, default '')、`createdAt`(CreateDateColumn)
  - `@Unique(['userId','date'])`：同日重复生成返回已有报告（AI-502 生成幂等由该约束兜底）
- 注册：`database.config.ts` 的 `appEntities` 加入 `AiReport`（**核心交付**：`synchronize` 自动建表）；
  `AiModule` 的 `TypeOrmModule.forFeature([... AiReport ...])`（`@Global()`，AI-502 直接注入仓库无需改模块）
- 测试：`server/src/ai/ai-report.entity.spec.ts`（in-memory better-sqlite3 + 真实 `appEntities` 行为测试）

## 质量门结论

### consistency — PASSED
- `nest build`（tsc 严格）0 错误
- `jest` 全量 **271/271 通过**（含 `ai-report.entity.spec.ts` 6 case）
- `npm run seed`：`DataSource.initialize` 不抛错，`ai_reports` 表由 `synchronize` 建立，PRAGMA 确认列与唯一索引 `sqlite_autoindex_ai_reports_2`（`unique:1`）落地
- 纯后端实体，无全栈契约需对齐

### tests — PASSED
- **单元测试 1 文件 / 6 测试**（`ai-report.entity.spec.ts`）：
  1. synchronize 建表 + 默认值（createdAt 生成、weakWords 默认 `[]`、suggestionText 默认 `''`）
  2. weakWords 空数组 simple-array round-trip 仍为空
  3. weakWords 多元素 round-trip 一致（可移植 postgres）
  4. `(userId,date)` 唯一约束：同用户同日第二次 `save` 抛 `QueryFailedError`，仅首条留存
  5. 不同日期可共存（约束只作用于同组合）
  6. 不同用户同日可共存
- **BDD/E2E 0**：纯数据模型实体，无前端 UI 旅程、无 HTTP 路由（路由在 AI-502 落地）；
  不为纯后端写 BDD，已在 `features/ai-501.md` 显式标注豁免，E2E 旅程随 AI-504（Home「今日 AI 小结」卡片）交付

### review — PASSED（0 open）
- 空安全：`summaryText` / `weakWords` / `suggestionText` 均有默认值；`userId` / `date` 为必填（无 null 路径）
- 唯一约束幂等：约束在实体层声明，重复插入由 AI-502 业务层捕获返回已有报告（已在设计文档与下游标记）
- 可移植性：`weakWords` 用 `simple-array` 而非 `json`——项目 `better-sqlite3` 驱动无 `json` 列先例，simple-array 双驱动可移植，与 `AiSpeechAttempt.weakPhonemes` / `Sentence` 同口径
- 时间列铁律：`createdAt` 用 `@CreateDateColumn()`，未用 `@Column({type:'timestamp'})`（避免 better-sqlite3 `DataTypeNotSupportedError`）
- 非硬 FK：`userId` 存 varchar，不级联删 User（与 `AiUsage` / `AiSpeechAttempt` 同审计型口径）
- 无裸 console（实体无日志）；风格与 `AiUsage` / `AiSpeechAttempt` 一致

### optimization — PASSED（0 open）
- 无 stub / 占位实现
- `simple-array` 复用弱项存储，无重复造轮子
- 无临时调试代码；仅新增实体 + 注册，未重构无关代码

## 验证命令（可复现）

```bash
cd server
npm run build                     # 0 错误
npx jest ai-report.entity.spec.ts # 6 passed
npm run seed                      # ai_reports 表建立
```
