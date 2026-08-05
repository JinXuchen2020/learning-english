# AI-303 质量门报告

> 分支: feat/ai-303 | 栈: node-ts (NestJS 10 + TypeORM) | 提交后由 pre-commit hook 强执
> 门禁文件: `.quality-gate.json`（phase=ai-303, cleared=true, enforced=true）

## 四道通用门

| 门 | 结果 | 证据 |
| --- | --- | --- |
| consistency | ✅ PASSED | server `tsc --noEmit` 0 错误；`nest build` 通过；jest 49 suites / 364 tests 全绿（AI-303 新增 3 spec 共 36 case）；`synchronize` 建表无 `DataTypeNotSupportedError`；覆盖率 90/70 基线不退化 |
| tests | ✅ PASSED | 单元测试 3 文件 36 case 覆盖校验全分支 + 错误码映射 + provider 入参断言；BDD/E2E 0（纯后端 API 豁免，见下） |
| review | ✅ PASSED | 0 open；空安全 / MIME 白名单 / 错误码语义 / 句库未就绪显式 400 / 时长信任客户端 / 不落库边界 / 异常翻译 / 无裸 console |
| optimization | ✅ PASSED | 0 open；无 stub；纯函数可直覆；评分委托 provider 契约（Mock 已返回确定性 ScoreResult）；自定义接口避免 @types/multer 依赖 |

## 改动文件

- `server/src/ai/speech-evaluate.validation.ts` — **纯逻辑校验层**：`ALLOWED_AUDIO_MIME` /
  `MAX_AUDIO_BYTES=5MB` / `MAX_DURATION_MS=15s` / `HARD_UPLOAD_LIMIT_BYTES=10MB` /
  `SpeechEvaluateError(status,code)` / `validateSpeechUpload`（大小→格式→时长顺序校验，纯函数）
- `server/src/ai/speech-evaluate.dto.ts` — `EvaluateSpeechDto`（class-validator：
  `wordId`/`sentenceId`/`referenceText?`/`durationMs?`，`durationMs` 经 `@Type(()=>Number)` 转 number）
- `server/src/ai/ai-speech-evaluator.service.ts` — `AiSpeechEvaluatorService.evaluate`：
  校验 → `resolveReferenceText`（wordId→`Word.text` / referenceText 直用 / sentenceId→400 未就绪）→
  `provider.assessPronunciation({data:file.buffer,mimeType}, ref, {passLine:60})`；**不落库**
- `server/src/ai/ai.controller.ts` — `POST ai/speech/evaluate` + `FileInterceptor('audio',{limits})`；
  `SpeechEvaluateError` → `HttpException({code,message}, status)` 翻译
- `server/src/ai/ai.module.ts` — 注册 `AiController`（`controllers`）+ `AiSpeechEvaluatorService`（providers）
  + `Word` 进 `TypeOrmModule.forFeature`
- `server/src/ai/speech-evaluate.validation.spec.ts` / `ai-speech-evaluator.service.spec.ts` /
  `ai.controller.spec.ts` — 3 文件 36 case
- `server/src/ai/ai.module.spec.ts` — 回归补 `getRepositoryToken(Word)` 仓库桩（AiModule 现含
  AiController + AiSpeechEvaluatorService，编译期需提供 Word 仓库）

## E2E 豁免口径（重要）

AI-303 是**纯后端 API 端点**，无前端 UI（前端消费者为 AI-307 `/speech` 页）。按本项目
「不为纯后端 API 写 BDD」铁律（feature-builder 质量门合同），BDD/E2E **豁免**，与 AI-301
（纯后端实体）同口径。验收标准「合法音频返回评分 / 超大空音频返回 4xx」已由单元测全覆盖：
- 合法 webm + `wordId` → 200 + `ScoreResult`（Mock 下 score=88）
- 缺 audio / 空 → 400 `NO_AUDIO`/`EMPTY_AUDIO`
- 超 5MB → 413；坏 MIME → 415；超 15s → 400；word 未找到 → 404

完整「听→录→评→反馈」用户旅程将在 AI-307 `/speech` 页的 E2E 中经 client-side 导航覆盖
（该页嵌入 AI-302 `SpeechRecorder` 并调用本接口）。设计文档 `features/ai-303.md` §6 已显式标注。

## 风险与边界

- **无 Sentence 实体**：句库 AI-309 才建；`sentenceId` 当前显式返回 400 `SENTENCE_SCORING_NOT_READY`。
- **时长校验信任客户端**：服务端不解析音频元数据（无 ffmpeg），`durationMs` 由 `SpeechRecorder`
  上报；真实服务端解析留作后续增强。
- **不落库**：评分持久化属 AI-306（消费 AI-301 `ai_speech_attempts` 实体），本 feature 不引入该依赖。
- **评分实现增强在 AI-304/305**：STT 转写、Azure 音素级打分、相似度兜底将增强 `AiProvider`
  实现；本服务只依赖契约，不感知具体算法。
