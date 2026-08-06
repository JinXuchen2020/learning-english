# AI-306 质量门报告

> feature: `feat/ai-306` · 口语评分反馈 + 持久化（M3 口语训练）
> 日期: 2026-08-06 · 栈: node-ts（NestJS + TypeORM + Jest）
> 质量门: consistency + tests + review + optimization — 四道全绿（cleared:true）

## 1. 交付物概览

| 文件 | 类型 | 说明 |
|---|---|---|
| `server/src/ai/speech-feedback.util.ts` | 纯逻辑 | `PASS_LINE=60` / `SpeechFeedback` 类型 / `levelFromScore` / `buildSpeechFeedback` / `buildAttemptEntry`（占位边界） |
| `server/src/ai/ai-speech-feedback.service.ts` | 服务 | `AiSpeechFeedbackService.feedback()` 装配反馈 + best-effort 落库 |
| `server/src/ai/ai-speech-evaluator.service.ts` | 重构 | AI-303 评测流程末尾委托 feedback（返回类型 `ScoreResult`→`SpeechFeedback`） |
| `server/src/ai/speech-evaluate.dto.ts` | DTO | 增加 `userId?` / `audioPath?` 可选字段 |
| `server/src/ai/ai.module.ts` | 注册 | 注册 `AiSpeechFeedbackService` 进 providers+exports |
| `server/src/ai/speech-feedback.util.spec.ts` | 测试 | 纯逻辑全分支 |
| `server/src/ai/ai-speech-feedback.service.spec.ts` | 测试 | 服务全分支（fake `AiSpeechAttemptService`） |
| `server/src/ai/ai-speech-evaluator.service.spec.ts` | 测试 | 改 fake feedback 验证委托（回归） |
| `server/src/ai/ai.module.spec.ts` | 测试 | 补 `AiSpeechFeedbackService` 导出断言（回归） |
| `features/ai-306.md` | 设计 | 目标/反馈结构/落库边界/测试计划 |
| `features/backlog.md` | 文档 | AI-306 → done |
| `.quality-gate.json` + 本报告 | 门禁 | 四道门证据 |

## 2. 一致性门（consistency）— PASSED

- `server tsc --noEmit`：**0 错误**
- `nest build`：**通过**
- `synchronize` 建表成功，无 `DataTypeNotSupportedError`
- 全量 `jest`：**55 suites / 436 tests 全绿**（AI-305 为 53/417，AI-306 新增 2 spec 共 19 case）
- 覆盖率 90/70 基线**不退化**（实际 97.92% stmts / 82% branch）
- 项目未配置 ESLint，一致性证据以 `tsc`+`jest`+`nest build` 为准

## 3. 测试门（tests）— PASSED

### 单元测试（server jest，2 文件 19 case 全绿）
- **`speech-feedback.util.spec.ts`（11 case）**：`levelFromScore`（弱/ok/good 边界含 60/80）、`buildSpeechFeedback`（passed 边界 60→true/59→false；level 档位；mascotExpr 优先 `result.mascotExpr` 否则按分推断；透传字段）全分支；`buildAttemptEntry`（userId 未提供/空白→`anonymous` 占位、非空 trim 透传；audioPath 未提供→`<inline>` 占位、非空 trim 透传；wordId/sentenceId 透传、score/weakPhonemes 透传；sentenceId 模式 wordId 为 null）全分支
- **`ai-speech-feedback.service.spec.ts`（8 case）**：fake `AiSpeechAttemptService` 覆盖 — 落库成功→`record` 调用一次 + 入参 entry 正确（userId/score/weakPhonemes/audioPath 占位）+ 返回 `SpeechFeedback`（`passed`/`level`/`mascotExpr`）；落库抛错→best-effort 不抛 + 仍返回 `SpeechFeedback`（不阻断）；未提供 userId→`anonymous` 占位

### 回归
- `ai-speech-evaluator.service.spec.ts` 改 fake feedback 验证委托：返回 `SpeechFeedback`（`passed`/`level` 正确）、feedback 入参 `userId`/`dto`/`result` 正确、`dto.userId` 透传、校验失败短路不调 scorer/feedback
- `ai.module.spec.ts` 补 `AiSpeechFeedbackService` 导出断言

### BDD / E2E — 0（豁免）
AI-306 是**纯后端逻辑**（复用 AI-303 端点、无新 HTTP 端点、无前端 UI），仅装配反馈 + best-effort 落库。按本项目**「不为纯后端逻辑写 BDD」铁律**豁免，与 AI-301/303/304/305/106 纯后端同口径；验收（分数正确入库 + weakPhonemes 可展示 + 通过线判定）由单元测全覆盖；用户级口语旅程随 **AI-307** `/speech` 页交付（设计文档 §6 显式标注）。

## 4. 评审门（review）— PASSED

- **空安全**：落库异常被二次兜底捕获**不抛**（与 AI-301/108 best-effort 口径一致），绝不阻断孩子口语反馈
- **分数边界**：AI-305 `clamp[0,100]` + AI-301 `clampScore` 双重兜底
- **实体防腐**：`audioPath` 用 `<inline>` 占位、`userId` 用 `anonymous` 占位，**不改 AI-301 实体契约**，仍满足 `non-nullable` 约束
- **吉祥物表情**：优先 `result.mascotExpr`，缺失时 `inferMascotExpr` 按分推断
- **无越界**：不引入新实体/Repository 依赖（复用 `AiSpeechAttemptService`）；不接 auth（deferred，userId 走 body，与 M2 链口径一致）；不落盘音频（inline 占位，属后续存储 feature）
- **接口演进清爽**：`evaluate` 返回类型 `ScoreResult`→`SpeechFeedback`（增强结构），controller 无需改翻译逻辑

## 5. 优化门（optimization）— PASSED

- 无 stub / 占位；纯函数 `levelFromScore`/`buildSpeechFeedback`/`buildAttemptEntry`/`PASS_LINE` 导出供 node 单测直覆
- 降级路径零额外分配（`speech-feedback.util` 全纯函数）
- 落库异常捕获后仅一次 `logger.warn`，无重试 / 无额外网络
- 无临时调试残留；顺手补全 `AiModule` exports（`AiSpeechFeedbackService` 对外导出，供 AI-307 消费反馈结构）

## 6. 关键设计决策与边界

- **落库占位约定**（保持 AI-301 实体契约稳定）：评测接口收 multer 内联 audio buffer，无持久路径 → `audioPath` 用 `<inline>` 占位；鉴权 deferred → `userId` 用 `anonymous` 占位。音频持久化 / 对象存储属后续存储 feature，本 feature 仅记录评分。
- **降级不抛错**：落库 best-effort（record 自身已吞异常，本服务再兜一层），与 AI-301/108 既定口径一致。
- **反馈结构**：`SpeechFeedback = ScoreResult & { passed, level, mascotExpr }`，通过线 60、等级 good(≥80)/ok(≥60)/weak(<60)，直接驱动 AI-307 星级 / 庆祝动画。
- **不落库音频**：避免越界（音频存储 / 对象存储不在本 feature 范围）。
- **回归处理**：evaluator.spec 改 fake feedback 验证委托；ai.module.spec 补 `AiSpeechFeedbackService` 导出断言。

## 7. 下一步（M3）

- **AI-307** `/speech` 页（嵌入 AI-302 录音组件 + 调 AI-303 评测接口 + 展示本 feature 的 `SpeechFeedback`（passed/level/mascotExpr/weakPhonemes）+ 口语 E2E 旅程，落地 M3 用户可感知验收）
- **AI-309** 句子跟读库（供句子模式；AI-303 当前 sentenceId→400 待其落地）
