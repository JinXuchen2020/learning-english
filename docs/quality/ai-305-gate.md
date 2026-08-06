# AI-305 质量门报告

> feature: `feat/ai-305` · 发音评分策略（M3 口语训练）
> 日期: 2026-08-06 · 栈: node-ts（NestJS + TypeORM + Vitest/Jest）
> 质量门: consistency + tests + review + optimization — 四道全绿（cleared:true）

## 1. 交付物概览

| 文件 | 类型 | 说明 |
|---|---|---|
| `server/src/ai/text-similarity.util.ts` | 纯逻辑 | Levenshtein 距离 / 分词相似度 / 策略选择 / LLM 评估解析（零依赖，node 可测） |
| `server/src/ai/ai-pronunciation-scorer.service.ts` | 服务 | `AiPronunciationScorerService.score()` 评分策略编排（首选 phoneme / 兜底 similarity） |
| `server/src/ai/ai-speech-evaluator.service.ts` | 重构 | AI-303 评测服务改为**委托** scorer（移除对 provider 的直接注入，单一职责） |
| `server/src/ai/ai.module.ts` | 注册 | 注册 `AiPronunciationScorerService` 进 providers+exports |
| `server/src/ai/ai-pronunciation-scorer.service.spec.ts` | 测试 | 服务全分支（fake provider + fake transcriber） |
| `server/src/ai/text-similarity.util.spec.ts` | 测试 | 纯函数全分支 |
| `server/src/ai/ai-speech-evaluator.service.spec.ts` | 测试 | 改为 fake scorer 验证委托（回归） |
| `server/src/ai/ai.module.spec.ts` | 测试 | 补 `AiPronunciationScorerService` 桩（DI 隔离回归） |
| `features/ai-305.md` | 设计 | 目标/契约/策略/测试计划 |
| `features/backlog.md` | 文档 | AI-305 → done |
| `.quality-gate.json` + 本报告 | 门禁 | 四道门证据 |

## 2. 一致性门（consistency）— PASSED

- `server tsc --noEmit`：**0 错误**
- `nest build`：**通过**
- `synchronize` 建表成功，无 `DataTypeNotSupportedError`
- 全量 `jest`：**53 suites / 417 tests 全绿**（AI-304 为 51/385，AI-305 新增 2 spec 共 32 case）
- 覆盖率 90/70 基线**不退化**（实际 97.87% stmts / 81.69% branch）
- 项目未配置 ESLint（`next lint`/`eslint` 未强执，与 AI-301/302/303/304 同口径），一致性证据以 `tsc`+`jest`+`nest build` 为准

## 3. 测试门（tests）— PASSED

### 单元测试（server jest，2 文件 32 case 全绿）
- **`text-similarity.util.spec.ts`（21 case）**：`levenshteinDistance`（空串/等长/替换/插入/删除/西里尔越界→255）、`tokenSimilarity`（空→0、完全匹配→1、编辑距离归一化、大小写不敏感）、`selectScoringStrategy`（有音素→phoneme、无音素→similarity、显式 force、auto 默认）、`parseLlmAssessment`（合法 JSON→透传、越界 score→`clamp[0,100]`、缺失 field→默认、脏数据/非 JSON→`null`）全分支覆盖
- **`ai-pronunciation-scorer.service.spec.ts`（11 case）**：fake provider+transcriber 覆盖 — 首选策略透传 + `degraded:false`；无音素→自动兜底 similarity（完全匹配→`score:100`、不匹配→低分）；transcribe 降级空文本→similarity 0→低分+`degraded`+友好反馈；LLM 解析成功→合并 score/weakPhonemes/feedback；LLM 脏数据→`null`→回退相似度；越界 provider 得分→`clamp[0,100]`；`provider.assessPronunciation` 抛错→降级不抛且回退 similarity

### BDD / E2E — 0（豁免）
AI-305 是**纯后端服务**（无 HTTP 端点、无前端 UI），仅被 AI-303 评测接口内部调用，输出统一 `ScoreResult`。按本项目**「不为纯后端逻辑写 BDD」铁律**豁免，与 AI-301/303/304/106 纯后端同口径；验收（两种策略输出统一 ScoreResult / 分数 ∈ [0,100]）由单元测全覆盖；用户级口语旅程随 **AI-307** `/speech` 页交付（设计文档 §4/§5 显式标注）。

## 4. 评审门（review）— PASSED

- **空安全**：provider / transcribe / LLM 异常均被捕获降级**不抛**（与 AI-102/304 降级口径一致）
- **策略选择透明**：`selectScoringStrategy` 优先音素级、无音素回退相似度，与 backlog「首选 Azure phoneme 级、无 Azure 用转写相似度 + LLM 兜底」一致
- **分数边界**：`clampScore[0,100]` 保证分数 ∈ [0,100] 不越界
- **接口防腐**：`ScoreResult` 扩展（`degraded`/`degradeReason`）在 service 内定义，**不污染** `AiProvider` 接口契约（AI-101），避免跨 feature 改接口
- **边界严守**：不落库（持久化属 AI-306）；无裸 `console`（统一 `logger.warn` 标记降级）
- **重构清爽**：`AiSpeechEvaluatorService` 移除对 provider 的直接注入 → 注入 `AiPronunciationScorerService`，单一职责
- **依赖收敛**：服务仅依赖已注册的 `AI_PROVIDER_TOKEN` + `AiTranscribeService`，无新 Repository 依赖

## 5. 优化门（optimization）— PASSED

- 无 stub / 占位；纯函数 `levenshteinDistance`/`tokenSimilarity`/`selectScoringStrategy`/`parseLlmAssessment` 导出供 node 单测直覆
- 降级路径零额外分配（`text-similarity.util` 全纯函数）
- 异常捕获后仅一次 `logger.warn`，无重试 / 无额外网络（符合 AI-106/304 不重试约定）
- 无临时调试残留；顺手补全 `AiModule` exports（`AiPronunciationScorerService` 对外导出，供 AI-306 消费）

## 6. 关键设计决策与边界

- **真实 Azure 端点边界**：智谱 BigModel 无公开音素级发音评测能力（AI-102 已定），本项目不硬接未配置真实端点（无 key 无法验证，违反质量门）。当前 BigModel 返回确定性 `ScoreResult`（Mock/BigModel 均保证可测），真实 Azure 接入留作后续增强 — 届时仅替换 provider 实现，`score()` 契约不变。
- **降级不抛错**：与 AI-102/304 既定口径一致；兜底链（phoneme→similarity→LLM）保证任何单点失败都有可用评分，不阻断上游 AI-303 评测接口。
- **不落库**：评分结果持久化在 **AI-306**（消费 AI-301 `ai_speech_attempts` 实体），本 feature 不引入该依赖。
- **回归处理**：`ai-speech-evaluator.service.spec` 改为 fake scorer 验证委托；`ai.module.spec` 补 `AiPronunciationScorerService` 桩。

## 7. 下一步（M3）

- **AI-306** 评分反馈 + 落库（消费 AI-301 `ai_speech_attempts` 实体，消费本 feature 的 `ScoreResult`）
- **AI-307** `/speech` 页（嵌入 AI-302 录音组件 + 调 AI-303 评测接口 + 口语 E2E 旅程，落地本 M3 链的用户可感知验收）
