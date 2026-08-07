# AI-401 质量报告 — 对话陪练数据模型（实体 + 建表）

> 栈: node-ts (NestJS 10 + TypeORM, better-sqlite3 / postgres 双驱动)
> 分支: feat/ai-401（基于 feat/ai-309）
> 日期: 2026-08-06

## 实现摘要

为 M4「AI 对话陪练」落地数据底座：

- **`AiChatSession`**（`ai_chat_sessions` 表，会话头）：`@Column userId`(varchar 255, index) + `sceneId`(varchar 64, index, 可空) + `stars`(int, 默认 0) + `createdAt`/`updatedAt`(UpdateDateColumn nullable)。
- **`AiChatMessage`**（`ai_chat_messages` 表，会话消息）：`@Column sessionId`(varchar 255, index) + `role`(varchar 16, 取值 `user`/`assistant`/`system`, 由 `CHAT_MESSAGE_ROLES` 常量约束) + `text`(text) + `audioPath`(varchar 512, 可空) + `createdAt`。
- 导出 `ChatMessageRole` 联合类型 + `CHAT_MESSAGE_ROLES` 常量数组，供 AI-403 DTO/校验复用。
- **`ChatModule`**：`TypeOrmModule.forFeature([AiChatSession, AiChatMessage])` 并导出 `TypeOrmModule`，作为 AI-403+ 注入仓库的注册点（与 `PlanModule` 同级，非 `@Global`）。
- 两实体注册进 `config/database.config.ts` 的 `appEntities`（`synchronize` 自动建表，与 AI-107/108/201/301 一致）；`ChatModule` 注册进 `app.module.ts` imports。
- `userId`/`sceneId`/`sessionId` 采用 **AI 审计记录口径**（varchar 引用，非硬外键），与 `AiSpeechAttempt`/`AiCallLog`/`AiUsage` 一致；不修改 `User` 实体、不引入跨模块级联。

## 四道质量门

### 1. 一致性门（consistency） — PASSED
- `nest build` 0 错误（`dist` 重新生成）。
- `jest` 全绿：454/454（较 AI-309 的 448 增加 6，来自本 feature 的 `chat.module.spec.ts`）。
- `npm run seed` 成功：`DataSource.initialize` + `synchronize` 未抛 `DataTypeNotSupportedError`；实测 `ai_chat_sessions` / `ai_chat_messages` 两表与列均已落库（见下方验证）。
- 纯后端数据模型，无前端，无全栈契约需对齐。

### 2. 测试门（tests） — PASSED
- **单元测试 2 文件**：
  - `src/chat/chat.module.spec.ts`（新增，6 cases）：in-memory better-sqlite3 + 真实 `appEntities` + `ChatModule` 验证——建表成功、session `stars` 默认 0、`sceneId` 可空且可落地、message `role`/`text` 落地、`audioPath` 默认 null / assistant 可带、`CHAT_MESSAGE_ROLES` 枚举完整性、按 `sessionId` 检索消息。
  - `src/entities/entities.metadata.spec.ts`（更新）：导入 `AiChatSession`/`AiChatMessage`，断言实体数 10→12，关系回调可调用。
- **BDD/E2E：0** — 纯后端数据模型，无前端 UI 旅程（会话 UI 属 AI-407），约束 #6「不为纯后端 API 写 BDD」豁免；非 legacy 豁免（实体无分支逻辑，无未覆盖行为）。

### 3. 代码审查门（review） — PASSED（0 open）
- 空安全：实体字段均有合理默认值（`stars` 0、`sceneId`/`audioPath` 可空、`createdAt` 由 DB 生成）；关系回调走 `() =>` 惰性引用，无运行期崩溃点。
- 枚举可移植：`role` 用 `type: 'varchar'` + TS 联合类型（与 `AiCallLog.status` 同口径），不用 DB 原生 enum，sqlite/postgres 双驱动兼容。
- 时间列铁律：一律 `@CreateDateColumn()` / `@UpdateDateColumn()`，未使用 `@Column({ type: 'timestamp' })`（AI-107 踩坑规避）。
- 非硬外键：`userId`/`sceneId`/`sessionId` 仅 varchar 引用，与 AI-301 审计记录口径一致，避免级联与模块耦合风险。
- 关联一致性：实体数断言 10→12 且关系回调可调用。
- 无裸 `console.*`；与现有 `entities/*.entity.ts` / `chat/` 风格一致。

### 4. 优化门（optimization） — PASSED（0 open）
- 无 stub / 占位实现；无临时调试代码。
- 角色合法值提取为 `CHAT_MESSAGE_ROLES` 常量数组复用，避免魔法字符串散落。
- `ChatModule` 仅做 `forFeature` 注册并导出 `TypeOrmModule`，无冗余导出。

## 建表验证（实测，npm run seed 后）

```
chat tables: [{"name":"ai_chat_sessions"},{"name":"ai_chat_messages"}]
ai_chat_sessions cols: id,userId,sceneId,stars,createdAt,updatedAt
ai_chat_messages cols: id,sessionId,role,text,audioPath,createdAt
```

## 遗留 / 后续
- 本 feature 仅建表 + 实体 + 模块注册；聊天接口（AI-403）、TTS 集成（AI-402）、会话 UI（AI-407）、星标（AI-408）、历史续聊（AI-409）复用本实体与 `ChatModule` 仓库。
- `docs/ai-integration.md` 中原 `AiChatSession { id, userId, sceneId, startedAt, stars }` / `AiChatMessage { id, sessionId, role enum(bot|user), text, audioPath?, createdAt }` 旧描述已在本 feature 文档同步中修正为实际落地 schema（`startedAt`→`createdAt`/`updatedAt`；角色 `bot|user`→`user|assistant|system`；模块名 `AiConversationModule`→`ChatModule`）。
