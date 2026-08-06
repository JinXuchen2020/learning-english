# AI-309 质量门报告

**Feature**: 句子跟读库 — 预置分级跟读句 + `GET /api/sentences` + 打通 AI-303 sentenceId 评分路径
**分支**: `feat/ai-309`
**日期**: 2026-08-06
**质量门**: consistency / tests / review / optimization（四道全 PASSED，`cleared:true`）

---

## 1. 交付范围

| 类别 | 文件 | 说明 |
|------|------|------|
| 实体 | `server/src/entities/sentence.entity.ts` | `Sentence` 实体（text/meaning/level/wordTexts/tags/lessonId/sortOrder），`simple-array` 双驱动可移植 |
| 后端模块 | `server/src/sentences/` | `SentencesModule` + `SentencesService`(内存过滤+稳定排序) + `SentencesController`(`GET /api/sentences`, `JwtAuthGuard`) + spec |
| 注册 | `server/src/app.module.ts`、`server/src/config/database.config.ts` | 注册 `SentencesModule`；`Sentence` 加入 `appEntities`（Nest + seed DataSource 共用） |
| 打通 AI-303 | `server/src/ai/ai-speech-evaluator.service.ts`、`ai.module.ts`、`speech-evaluate.dto.ts` | `sentenceId` 分支由 400 `SENTENCE_SCORING_NOT_READY` → 查 `Sentence.text`，未命中 404 `SENTENCE_NOT_FOUND` |
| Seed | `server/src/seed.ts` | 写入 36 句（L1/L2/L3 各 12，覆盖 P0 动物词） |
| 前端类型/API | `src/lib/types.ts`、`src/lib/api.ts`、`api.spec.ts` | `Sentence` 接口 + `getSentences(query)`（trim 过滤，无过滤不拼 `?`） |
| 前端页面 | `src/app/speech/page.tsx` | 单词/句子双模式切换（`PracticeItem` 抽象 + `ModeToggle`，并行加载句库失败不阻断） |
| E2E | `src/e2e/features/sentence-library.feature`、`step-definitions/sentence-library.steps.ts`、`support/pages/speech.ts` | 2 scenarios：切句子模式见卡片+听音按钮 / 句子模式录音提交得星 |

---

## 2. 质量门证据

### 2.1 consistency ✅
- 后端 `npx nest build` 退出码 0，无类型错误，重新生成 `dist/main`。
- 前端 `next build` 通过（`/speech` 路由 + 全页面编译）。
- 类型一致链：`Sentence` 实体 ↔ `database.config.appEntities` ↔ `types.ts Sentence` 接口 ↔ `api.ts getSentences` ↔ `speech-evaluate.dto.ts sentenceId` 语义；`EvaluateSpeechOptions.sentenceId?` 新增。
- jest 448/448 + vitest 67/67 + e2e 21/21 全绿且编译零类型错。

### 2.2 tests ✅
- **后端 jest 448/448**：
  - 新增 `sentences.service.spec` 6 case（全量排序 / level=L1 过滤 / wordText 不区分大小写 / 空白 wordText 等效不过滤 / findById 命中 / 未命中）。
  - 新增 `sentences.controller.spec` 5 case（无参 / level / wordText / 空白参数 / 返回结果）。
  - `ai-speech-evaluator.service.spec` 改为 4 参构造 `(wordRepo, sentenceRepo, scorer, feedback)` + 新增「sentenceId 命中→解析 Sentence.text 评分」「sentenceId 未命中→404 SENTENCE_NOT_FOUND」（替换原 400 占位）。
  - `ai.module.spec` 桩 `getRepositoryToken(Sentence)`。
- **前端 vitest 67/67**：新增 `api.spec` `getSentences` 3 case（无参 / level+wordText / 空过滤无尾问号）。
- **E2E/Bdd 21/21**（含新增 `sentence-library.feature` 2 scenarios）：headless 麦克风 harness 沿用 AI-307 铁律（`--use-fake-device-for-media-stream` + `--use-fake-ui-for-media-stream` + `Object.defineProperty` 覆盖 `getUserMedia`/`MediaRecorder`）；`speech.ts` 新增 `switchToSentences` / `sentenceCardCount`；AuthGate 页禁 `page.goto`，改客户端 SPA 导航保活 token。

### 2.3 review ✅
- `Sentence` 字段精简且双驱动可移植：`simple-array` 的 `wordTexts` 以**词汇文本**关联 P0 词，避免 seed 期 uuid 耦合。
- `SentencesService.findAll` 在服务层内存做 `level` 等值 + `wordText` 包含（不区分大小写）过滤，并按 `level.localeCompare` + `sortOrder` 稳定排序；空白参数降级为不过滤。
- `SentencesController` 受 `JwtAuthGuard` 保护（与全站一致），空/纯空白 query 不过滤。
- **AI-303 打通**：`resolveReferenceText` 的 `sentenceId` 分支由占位 400 `SENTENCE_SCORING_NOT_READY` 改为查 `Sentence` 表，命中返 `text`、未命中抛 404 `SENTENCE_NOT_FOUND`（语义正确，原 400 是未实现占位）。
- 前端 `/speech` 抽象 `PracticeItem`，单词/句子双模式切换（`SentenceCard` 隐藏 phonics、文本缩排），`Promise.allSettled([getAllWords, getSentences])` 并行加载，句库失败不阻断单词模式。
- 无新后端端点（除 `GET /api/sentences`），无新依赖。

### 2.4 optimization ✅
- 移除死代码：`SentencesService` 初版未使用的 `getOrThrow`；controller 嵌套 `Promise` 显式返回类型注解。
- `wordTexts` 用 `simple-array` 而非关联实体，省去 seed 期 uuid 解析复杂度。
- 无 stub/占位；无裸 `console`（统一 `logger`）。
- seed 写入 36 句，`sentenceRepo.clear()` 幂等重跑；`ModeToggle` 用 `data-component`/`data-action` 供 E2E 定位；SPA 导航保活 token 规避整页 reload 清空内存 JWT。

---

## 3. 冒烟验证（手工）
- 后端 PID 36128 `node dist/main` 在 :4000，前端 `next start` 在 :3000（清库重 seed 后新鲜启动）。
- `GET /api/sentences` → 200，返回 36 条；`?level=L1` → 12；`?wordText=cat` → 7；排序 L1 优先。
- 前端句子模式卡片渲染 + 录音评分得星闭环通过（E2E 2 scenarios）。

---

## 4. 遗留 / 后续
- backlog AI-309 → `done`。
- 共享 sqlite 整轮 E2E 前已清库重 seed + 重启后端，21/21 稳定全绿（沿用 AI-308 教训）。
- 提交不 push，等待 review。
