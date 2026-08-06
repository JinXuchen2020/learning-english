# AI-304 质量门报告 — STT 集成（转写 + 降级编排层）

> 分支: `feat/ai-304`（基于 `feat/ai-303`）| 栈: node-ts (NestJS 10 + TypeORM) | 提交: 未 push
> 质量门强执: `core.hooksPath=scripts/git-hooks` pre-commit 校验 `.quality-gate.json` cleared:true + 四门 PASSED

## 1. 四道质量门（Phase 4）

| 门 | 状态 | 证据 |
| --- | --- | --- |
| consistency | ✅ PASSED | server `tsc --noEmit` 0 错误；`nest build` 通过；`synchronize` 建表成功无 `DataTypeNotSupportedError`；jest 全量 **51 suites / 385 tests 全绿**；覆盖率 90/70 基线不退化 |
| tests | ✅ PASSED | 单元 2 spec 共 21 case 全绿（纯逻辑全分支 + 服务降级全分支）；BDD/E2E 0（纯后端服务豁免，见 §3） |
| review | ✅ PASSED | 0 open（空安全 / 降级语义清晰 / 阈值常量化 / 类型扩展不污染接口 / 不落库边界 / 异常捕获不抛 / 真实端点边界清晰） |
| optimization | ✅ PASSED | 0 open（无 stub/占位；纯函数可直覆；降级零额外分配；无临时调试；顺手补全模块 exports） |

## 2. 改动文件（10 files）

**源码（3）**
- `server/src/ai/transcribe-result.util.ts` — 纯逻辑层（零依赖，node 可测）：`normalizeTranscript` / `DEGRADED_CONFIDENCE_THRESHOLD=0.3` / `classifyTranscript`(empty/low_confidence/ok) / `summarizeTranscript`
- `server/src/ai/ai-transcribe.service.ts` — `AiTranscribeService.transcribe()`：注入 `AI_PROVIDER_TOKEN`，调 `provider.transcribe` 捕获异常降级（不抛错），合并 `classifyTranscript` 标注 `degraded`/`degradeReason`；返回 `TranscriptOutcome`（`TranscriptResult` 扩展，不污染 AI-101 接口）
- `server/src/ai/ai.module.ts` — 注册 `AiTranscribeService` 进 providers+exports（顺手补全 `AiSpeechEvaluatorService` 导出，供 AI-305 消费）

**测试（2）**
- `server/src/ai/transcribe-result.util.spec.ts` — 14 case
- `server/src/ai/ai-transcribe.service.spec.ts` — 7 case（含 provider 抛错降级不抛异常的关键验收）

**文档/门禁（5）**
- `features/ai-304.md`（设计文档）、`features/backlog.md`（AI-304→done）、`.quality-gate.json`、`docs/quality/ai-304-gate.md`

## 3. E2E 豁免（约束 #6，显式）

`AiTranscribeService` 是**纯后端服务**：无 HTTP 端点、无前端 UI，仅被 `AiSpeechEvaluatorService`(AI-303) 与下游 AI-305/306 评分链内部消费。按本项目「不为纯后端逻辑写 BDD」铁律豁免 BDD/E2E（与 AI-301 / AI-303 / AI-106 纯后端豁免同口径）：

- 验收（清晰发音可被转写 / 空→empty / 低置信→low_confidence / provider 错误→provider_error 且**不抛**）由单元测全覆盖。
- 用户级「听→录→评→反馈」口语旅程随 **AI-307** `/speech` 页交付（含口语 E2E 经 client-side 导航）。

## 4. 关键设计决策

1. **降级不抛错**：provider 抛错 / 空文本 / 低置信度统一降级标记（`degraded` + `degradeReason`），与 AI-102 既定降级口径一致，避免阻断上游评分流程。呼应 backlog「静音音频返回低分」——AI-304 标记降级 + 低置信，下游 AI-306 据此给低分。
2. **真实 STT 端点边界**：智谱 BigModel 无公开 STT API（AI-102 已定 `transcribe` 返回降级空结果），本项目不硬接未配置的真实端点（无 key 无法验证，违反质量门）。`AiTranscribeService` 职责是**调用编排 + 降级识别标注**；真实接入（如 Azure/第三方）留作后续增强，届时仅替换 provider 实现、接口不变。`MockAiProvider` 返回确定性 `MOCK_TRANSCRIPT` 保证「清晰发音可被转写」可测。
3. **类型扩展不污染接口**：`TranscriptOutcome` 在 service 文件内定义，避免跨 feature 改动 `AiProvider`(AI-101) 契约。
4. **不落库**：STT 结果持久化在 AI-306（消费 AI-301 `ai_speech_attempts`），本 feature 不引入该依赖。

## 5. 校验命令与结果

```bash
# 一致性
cd server && npx tsc --noEmit            # → 0 错误
cd server && npm run build               # → nest build 通过
cd server && npx jest --coverage         # → 51 suites / 385 tests 全绿; 90/70 基线不退化

# 测试（AI-304 增量）
cd server && npx jest transcribe-result ai-transcribe   # → 2 suites / 21 tests 全绿
```

## 6. 下一步 M3 链

- **AI-305** 发音评分策略（首选 Azure 音素级；无 Azure 时用「转写文本相似度（编辑距离）+ LLM 评估」兜底，消费本 feature 的 `transcribe()` 与 `degraded` 信号）
- **AI-306** 评分反馈 + 落库（消费 AI-301 `ai_speech_attempts`，据 `degraded` 给低分）
- **AI-307** `/speech` 页（嵌入 AI-302 录音组件 + 调 AI-303 评测接口 + 口语 E2E 旅程）
