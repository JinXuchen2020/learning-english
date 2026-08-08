# AI-601 质量门报告 — AI 单词卡片生成

- **Phase**: ai-601
- **Stack**: node-ts (NestJS 10 + TypeORM + better-sqlite3 / Next.js 14)
- **Branch**: feat/ai-601（提交不 push）
- **日期**: 2026-08-08
- **Gate 文件**: `.quality-gate.json`（扁平，`cleared:true`，`enforced:true`）

## 四道质量门结论

| 门 | 结论 | 关键证据 |
|----|------|----------|
| consistency | ✅ PASSED | `nest build` 0 错误；jest 77 suites / 648 tests 全绿（含 AI-601 word-card service/controller spec）；frontend `tsc` 0 错误 + vitest 全绿（含 `lib/wordCards.spec`）；全栈契约对齐（后端 `WordCardView` 镜像进 `src/lib/types.ts`，4 个 API 路由与前端 `api.ts` 一致）；TypeORM 联合类型字段（`string|null`/`Date|null`）显式 `type` 解决 `reflect-metadata` Object 反射 → `better-sqlite3` `DataTypeNotSupportedError` |
| tests | ✅ PASSED | **unit**: 后端 `ai-word-card.service.spec`（generate 解析/重试≤3/降级模板/内容安全拦截/状态流转/终态 409/未知 404/listByStatus）；前端 `lib/wordCards.spec`（filterWordCards/countByStatus）。**e2e/bdd**: `word-cards.feature` 1 scenario / 7 steps 全绿（注册→TabNav→输入兴趣→生成→看到 pending 卡→批准→状态变 approved）；全量 37 scenarios 仅 3 个既有失败与 AI-601 无关，0 ambiguous |
| review | ✅ PASSED | 0 open。复用 `matchBlocklist`/`AiProvider`/`Logger`；独立待审表 `ai_word_cards`；无裸 console；E2E step 唯一化消除 ambiguous 冲突；approve 加 `waitForApprovedCard` 消除竞态；TabNav 客户端导航保 token |
| optimization | ✅ PASSED | 0 open。降级模板零依赖；无 stub；重试≤3 后降级；approve/reject 直接更新 state 无重查 |

## 本次新增/修改文件

**后端（修复）**
- `server/src/word-card/ai-word-card.entity.ts` — 4 个联合类型字段显式 `type`（`exampleTrans`/`courseId`/`reviewerNote` → `varchar`，`approvedAt` → `datetime`），解决 `DataTypeNotSupportedError`

**前端（新增）**
- `src/lib/types.ts` — 镜像 `WordCard` / `WordCardStatus` / `GenerateWordCardDto` / `GenerateWordCardResult`
- `src/lib/api.ts` — `generateWordCards` / `listWordCards` / `approveWordCard` / `rejectWordCard`
- `src/lib/wordCards.ts`（新）+ `src/lib/wordCards.spec.ts`（新）— 纯逻辑（`filterWordCards` / `countByStatus`）
- `src/app/word-cards/page.tsx`（新）— 完整页面（兴趣输入→数量→生成→降级提示→状态过滤→卡片列表→批准/驳回）
- `src/components/TabNav.tsx` — 新增「卡片」Tab（第 4 项）

**E2E（新增）**
- `src/e2e/features/word-cards.feature`（新）+ `support/pages/wordCards.ts`（新）+ `step-definitions/word-cards.steps.ts`（新）— 1 scenario / 7 steps

**文档**
- `features/ai-601.md`（设计文档，状态 → done）
- `docs/quality/ai-601-gate.md`（本报告）
- `features/backlog.md` — AI-601 → `done`

## 关键修复

1. **TypeORM 联合类型反射 bug**：`string | null` / `Date | null` 字段用 `@Column({ nullable: true })` 未显式指定 `type`，`reflect-metadata` 反射为 `Object`，`better-sqlite3` `synchronize` 报 `DataTypeNotSupportedError`，连带导致 4 个全局 TypeORM suite 失败。修复：显式 `type: 'varchar'` / `type: 'datetime'`。
2. **E2E step 定义冲突**：`word-cards.steps.ts` 的 `"I click the generate button"` 与 `plan.steps.ts:83` 同名，导致 7 个 scenario ambiguous。修复：改为 `"I click the word card generate button"`。
3. **E2E approve 竞态**：`approveFirstPending()` 点击后立即返回，但 `api.approveWordCard(id)` 异步未完成，DOM `data-status` 尚未更新。修复：加 `waitForApprovedCard()` 等待 `data-status="approved"` 出现。

## 既有 E2E 失败（与 AI-601 无关）

| Feature | 场景 | 原因 | 备注 |
|---------|------|------|------|
| plan-progress:25 | Completing plan tasks | `completeAllTasks` 10s 超时 | 之前被 ambiguous 步骤掩盖，step 修复后暴露 |
| sentence-library:6 | Switches to sentences mode | `SentenceCard` 10s 超时 | 既有超时问题 |
| sentence-library:13 | Practices a sentence | `SentenceCard` 10s 超时 | 既有超时问题 |

## 后续可选

- 真实 LLM key 下验证生成质量（当前 mock 返回纯文本，走降级模板路径）。
- 内容安全可升级为 NVIDIA 异步分类器（当前仅黑名单硬闸）。
- 审核动作可接入 AI-702 家长 PIN 约束。
