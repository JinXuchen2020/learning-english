# AI-301 质量门报告

> 分支: feat/ai-301（基于最新分支 feat/ai-209）| 栈: node-ts (NestJS 10 + TypeORM) | 2026-08-05

## 改动摘要

为 M3「AI 每日口语训练」落地数据底座：

- **新增实体** `server/src/ai/ai-speech-attempt.entity.ts` → 表 `ai_speech_attempts`
  （`userId` / `wordId` / `sentenceId` / `audioPath` / `score` / `weakPhonemes` / `createdAt`）。
  - 时间列 `@CreateDateColumn()`（铁律，避免 better-sqlite3 `DataTypeNotSupportedError`）。
  - `weakPhonemes` 用 `simple-array`（sqlite/postgres 双驱动可移植）。
  - `userId` 存 `varchar` 非硬 FK（审计型追加记录，与 `AiCallLog` 同口径）。
- **新增服务** `server/src/ai/ai-speech-attempt.service.ts` → `AiSpeechAttemptService`
  - `record(entry)`：最佳努力落库，DB 失败仅告警返回 `false` 不阻断（与 AI-108 同口径）；
    落库层 `clampScore`（[0,100] 钳制 + 取整）与 `sanitizePhonemes`（清洗弱音素）兜底。
  - `findByUser(userId, limit=50)`：按 `createdAt DESC` 取最近 N 条。
- **注册**：`AiModule`（`forFeature` + providers + exports）与 `config/database.config.ts` 的 `appEntities`。
- **测试回归**：`ai.module.spec.ts` 桩 `AiSpeechAttempt` 仓库以适配新 DI 依赖。

## 四道质量门

| 门 | 结论 |
|---|---|
| consistency | PASSED — `tsc --noEmit` 0 错误；`nest build` 通过；jest 46 suites / 333 tests 全绿；`synchronize` 建表（`ai_speech_attempts`）成功无 `DataTypeNotSupportedError`；纯后端无全栈契约 |
| tests | PASSED — 单元测试 2 文件 17 case 全绿（覆盖 `clampScore`/`sanitizePhonemes`/`record`/`findByUser` 全分支）；BDD/E2E 0（纯后端豁免，设计文档显式标注，口语 E2E 旅程随 AI-307 交付） |
| review | PASSED（0 open）— 空安全 / score 钳制兜底 / best-effort 吞异常 / simple-array 可移植 / 时间列铁律 / 无裸 console / 与 AiCallLog 风格一致 |
| optimization | PASSED（0 open）— 无 stub/占位；纯函数复用；`repo.find` 单次查询无 N+1；无调试残留 |

## 测试证据

- `ai-speech-attempt.service.spec.ts`（13 case）：`clampScore` 边界 / `sanitizePhonemes` 清洗 /
  `record` 成功透传 + 越界钳制 + DB 失败 best-effort / `findByUser` 排序与 limit。
- `ai-speech-attempt.entity.spec.ts`（4 case）：建表默认值 / `simple-array` 空数组与多元素 round-trip /
  服务层 `clampScore` 兜底 / 倒序查询。

## 覆盖率

全量 `jest --coverage`：333 tests 全绿，全局 statement/line/function 90%、branch 70% 基线不退化。

## 遗留风险

- `userId` / `wordId` / `sentenceId` 非硬外键（审计型追加记录，与 AI-108 同口径）；弱项完整性由
  上游 AI-306（评分反馈）业务层保证。
- 口语 E2E 用户旅程（听→录→评→反馈→得星）随 AI-307 `/speech` 页交付，本 feature 不构建 UI。
- 未运行真实 `npm run seed`（需独立 DB 环境）；建表正确性已由 in-memory better-sqlite3 `synchronize`
  行为测试覆盖，等价校验 `DataSource.initialize` 不抛 `DataTypeNotSupportedError`。
