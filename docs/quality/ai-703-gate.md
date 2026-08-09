# AI-703 质量门报告

> 分支: `feat/ai-703` | 栈: node-ts (NestJS 10 + Next.js 14 + better-sqlite3) | 提交方式: 仅 commit（不 push）
> 对应设计文档: `features/ai-703.md`

## 四道通用质量门结论

### 1. 一致性门（consistency）— PASSED

- 前端 `tsc --noEmit`：0 错误（`src/lib/types.ts` 补 `category?`/`color?`，`src/app/practice/page.tsx` 重构经类型检查通过）。
- 后端 `tsc --noEmit`：0 错误（`word.entity.ts` 新增两列；`seed.ts` 注入字段）。
- `next build`：生产构建成功（16/16 静态页生成）。
- 全栈契约对齐：`Word` 实体新增 `category`/`color` 经 synchronize 自动随 `GET /words`、`GET /lessons/:id/words` 返回；前端类型补充对应可空字段，无 DTO 改动。实机验证 `/api/words` 返回 10 词且均含 `category`/`color`。
- 单元 + E2E 全绿（见下）。

### 2. 测试门（tests）— PASSED

**单元测试（前端纯逻辑模块）**：`src/lib/quizVariants.spec.ts`，19 个用例全绿（`vitest run --pool=forks`）：
- `generateListenQuestions`：词数 <2 返回空、2 词/4 词题项结构、正确索引指向目标、选项去重、perQuiz、确定性 rng。
- `generateCombinationQuestions`：缺字段过滤、重复组合歧义过滤、唯一组合出题且每题仅一个正确项、perQuiz、确定性。
- `judgeListen`/`judgeCombination`：命中/错误/越界/非整数。
- `buildQuizItems`：三模式输出结构（文本/插图选项、提示词、隐藏文字、颜色类别）。

**BDD/E2E**：`src/e2e/features/practice-variants.feature`，2 场景 / 16 步全绿：
- 听音选图模式：进课 → 切 listen → 见 ListenPrompt → 全对作答 → 完成页。
- 颜色组词模式：进课 → 切 combination → 见 ComboPrompt → 全对作答 → 完成页。

### 3. 代码审查门（review）— PASSED（0 open）

- 空安全：`option.word!` 仅用于插图选项（该分支 `word` 必存在）；combination 过滤缺 `color`/`category` 单词，绝不访问 null。
- 错误处理：`recordWordAttempt` 失败走 `logger.error` catch，不阻断 UI。
- 注入/安全：rng 可注入（默认 Math.random），无用户输入直接拼 SQL；颜色名→hex 用白名单映射，未知回落主题绿。
- 边界：模式切换重置进度并钳制越界 `currentIndex`；某模式下无可用题项（`items` 空）渲染友好空态，不崩。
- 组词歧义：仅对 `(color,category)` 唯一单词出题，杜绝多正确项。
- 日志：无裸 `console.*`。
- 测试面：新增纯逻辑模块有单测；UI 行为由 E2E 覆盖。

### 4. 优化门（optimization）— PASSED（0 open）

- 无 stub/占位代码；无临时调试输出。
- 错误处理统一（attempt 记录失败静默日志）。
- 删除/未用导出：无新增死代码；`MODE_LABELS`/`COLOR_HEX` 均为实际使用常量。

## 测试证据汇总

| 类型 | 文件 | 结果 |
|---|---|---|
| 前端单测 | `src/lib/quizVariants.spec.ts` | 19/19 通过 |
| BDD/E2E | `src/e2e/features/practice-variants.feature` | 2 场景 / 16 步通过 |
| 类型检查 | 前端 + 后端 `tsc --noEmit` | 0 错误 |
| 生产构建 | `next build` | 成功 |

## 遗留风险 / 说明

- 听音选图使用浏览器 Web Speech API 朗读单词；无该 API 的环境（含部分无头浏览器）静默降级，按钮仍在，不影响插图选词作答。
- 组词模式依赖 `category`/`color` 数据；旧单词（缺字段）自动被过滤，不会产出歧义或空题（自由练习全量词均带字段，故始终有题）。
- 本次未额外跑后端 jest 全套（本 feature 无新增后端 service 逻辑，仅实体列 + seed 数据；二者已通过 tsc 与实机 API 验证）。
- 当前分支 `feat/ai-703` 未 push，由用户决定 merge/push。
