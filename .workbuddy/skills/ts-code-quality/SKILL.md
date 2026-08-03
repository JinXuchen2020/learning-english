---
name: ts-code-quality
description: TS/NestJS/Next.js 取向的代码质量 skill，单体覆盖 feature-builder 的两道门——「代码审查（review）」与「优化（optimization）」。对抗式静态审查（类型安全/DI 生命周期/错误处理/注入安全/API 契约/测试面/并发资源/死代码/日志）+ 生产就绪优化（替换 stub/清理未用/统一错误处理/去调试/N+1/SSR 边界），并附带只读静态反模式扫描脚本。作为 feature-builder 在 TS 项目的可选增强调用；也接受用户显式请求「TS 代码审查」「NestJS 体检」「前端质量优化」「代码优化」。This skill should be used when 用户要求对 TypeScript/Node 代码做对抗式审查或生产就绪优化，或 feature-builder Phase 4 的 review/optimization 门需要 TS 取向的深度检查。
agent_created: true
---

# ts-code-quality — TS 代码质量（审查 + 优化）

单体质量 skill，服务 TypeScript 技术栈（NestJS 后端 + Next.js/React 前端）。它覆盖 feature-builder 四道门里的**代码审查门（review）**与**优化门（optimization）**两道——一个 skill、两种模式，避免为 .NET 取向的 `ddd-code-reviewer`/`codebase-optimizer` 错配到本项目。

## 心态（对抗式）

你不是在确认代码能跑，而是在**证伪**它。每读一个文件都问：「什么输入会让它崩？」默认假设每个模块至少有 3 个 bug，并试图找到它们。禁止在没列出至少 3 个已排查风险点的情况下说「看起来没问题」。

## 何时用 / 触发

1. **feature-builder 可选增强**：在 `feat/<id>` 分支 Phase 4 的 review/optimization 门，调用本 skill 做 TS 取向的深度检查（替代原 `ddd-*` 示例）。
2. **用户显式请求**：代码审查、NestJS 体检、前端质量优化、代码优化、代码重构建议、项目健康检查。
3. **阶段收尾治理**：当项目质量治理文档（如 `.quality-gate.json` / `docs/quality/*`）要求在 check-in 前跑深度质量检查时。

## 双模式

| 模式 | 对应 gate | 关注 | 产出 |
|------|-----------|------|------|
| `review`（审查） | Phase 4 门 3 `review` | 缺陷/风险/安全/契约 | 0 open 的对抗式审查报告 |
| `optimize`（优化） | Phase 4 门 4 `optimization` | 生产就绪、去桩、清洁度 | 0 open 的优化清单 + 修复 |

调用时由调用方指定模式（不指定默认 `review`）；两模式共用 Step 0 扫描与严重度体系。

## 输入

调用方（或用户）必须提供：
1. 模式（`review` / `optimize`）
2. 目标文件清单（本 feature 新增/修改的源码；全库体检则留空，由 Step 0 自动探测）
3. feature-id / 分支（用于报告落盘路径，如 `docs/quality/<id>-gate.md`）

## 工作流

### Step 0 — 静态扫描（可选但推荐）

运行内置只读扫描脚本，先拿一份反模式基线报告：

```sh
node .workbuddy/skills/ts-code-quality/scripts/code-quality-scan.mjs --dir <项目根>
```

脚本扫描 `src/**/*.{ts,tsx}`（跳过 `node_modules/.next/dist/build/coverage` 与 `*.spec.*`/`*.test.*`），对以下反模式给出 `File:Line` 报告：`any` 逃逸、`console.*` 残留、`TODO/FIXME/HACK`、空 catch、疑似硬编码密钥、`dangerouslySetInnerHTML`、`eval/new Function`、eslint-disable 抑制。脚本**只读不改**，输出 Markdown 表。默认不阻断流程（exit 0）；加 `--fail-on <P0|P1|P2|P3>` 后，凡达到该严重度（含更高）的 finding 都会让进程 `exit 1`，用于 CI 质量门：

```sh
# 仅报告（exit 0）
node .workbuddy/skills/ts-code-quality/scripts/code-quality-scan.mjs --dir <项目根>

# CI 门禁：出现 P1 及以上（P0/P1）finding 时 exit 1
node .workbuddy/skills/ts-code-quality/scripts/code-quality-scan.mjs --dir <项目根> --fail-on P1
```

它筛出候选，人工/子代理再定夺严重度；`--fail-on` 仅对真实风险模式（硬编码密钥、XSS、注入）这类 P0/P1 上锁，P2/P3（如 NestJS `@Request() req: any`、错误分支 `console.error`）按团队既有容忍度不阻断。

### Step 1 — 读取与范围

读取全部目标文件 + 其直接依赖（import 链上游），逐行读，不跳读。若对应 `*.spec.ts` 存在，一并读以评估测试面。

### Step 2 — 按模式加载 checklist

- `review` → 加载 `references/ts-review-checklist.md`，逐维度执行，标注命中为 open finding。
- `optimize` → 加载 `references/ts-optimize-checklist.md`，逐维度扫清洁度/就绪度，标注为 open finding。

每个文件至少经过「类型安全 + 错误处理 + 安全注入」三个通用维度；NestJS 类再加 DI/生命周期维度，React 组件再加 XSS/hook/key 维度。

### Step 3 — 缺陷定位（审查模式必做）

对主入口方法做控制流追踪：列出从入口到退出的每次调用 → 校验目标方法存在且非 stub → 校验接口实现已注册 DI → 校验 async 均已 await（无 fire-and-forget）→ 校验每个条件分支可达且有实现。对关键方法（入口/状态变更/校验器）读方法体，显式断言其不变量（如「分页边界 `<` vs `<=`」「校验是否基于真实输入而非常量」），记录 `VERIFIED file:line` 或 `VIOLATED file:line — <finding>`，**不得「方法存在即正确」**。

### Step 4 — 测试面（仅 review 模式）

列出目标源码的方法/分支，逐一比对是否有对应 `*.spec.ts` 覆盖（正常/边界/异常）；标注无测试的源码路径与缺失的边界用例。纯展示型组件（无逻辑分支）不强制单测，但其 UI 行为须有 BDD/E2E 覆盖（否则记 open）。

### Step 5 — 修复（auto-fix，强制）

**发现即修，不问人，不报告等待。** 收集所有确认 finding 后，逐条最小修复（不越界重构），每修一处验证 `${BUILD_CMD}`/`${TYPECHECK_CMD}`/`${TEST_CMD}` 仍绿，并记入报告。仅当修复需要**结构性决策**（如「这是新模块还是并入现有？」）才停下来问用户。

> 占位/simulator 返回（硬编码 `APPROVED`、返回假数据、模拟动作）**不是**有效豁免理由——属未完成实现，必须（a）修成真实逻辑，或（b）记为 open P1 finding 并引用设计文档授权的豁免条款。不得「超出范围」静默放过。

### Step 6 — 报告

按下方输出格式产出 Markdown 报告，落盘到 `docs/quality/<feature-id>-gate.md`（若已有则用对应门章节追加）。报告须含 findings 表 + 控制流分析 + 测试面 + Top 3 运行时风险 + 已修复项。

## 严重度

- **P0（Blocker）**：运行时崩溃、数据丢失、安全漏洞、死循环。
- **P1（High）**：静默失败、逻辑错误、注入风险、缺失错误处理、未完成实现。
- **P2（Medium）**：最佳实践缺失、测试缺口、契约未对齐。
- **P3（Low）**：代码质量、命名、轻微改进。

## 输出格式

```
## Code Quality Report: [模块/范围] (mode=<review|optimize>)

### Findings
| Severity | Category | File:Line | Finding | Evidence | Suggested Fix |
|----------|----------|-----------|---------|----------|---------------|
| P0 | ... | ... | ... | ... | ... |

### Control Flow Analysis (review only)
- Entry point: [method]
- Path: [calls]
- Dead ends / unregistered: [list or none]

### Test Coverage (review only)
- Source methods: [n]; Covered: [n]; Untested paths: [list or none]

### Top 3 Runtime Risks
1. [desc] — [file:line] — [trigger]
2. ...
3. ...

### Fixes Applied
- [file:line] [P?] [finding → fix]
```

## 与 feature-builder 集成

- 在 `feat/<id>` 分支 Phase 4 第 3 门（review）/第 4 门（optimization）后**可选追加**调用本 skill；默认不依赖（缺失则按 feature-builder 内置通用 checklist 执行）。
- 调用产出直接写入 `.quality-gate.json` 的 `gates.review` / `gates.optimization` 结论与 `docs/quality/<id>-gate.md`。
- 本 skill 不 push、不切分支，仅在本 feature 分支内产报告 + 修复（修复随本 feature 一起 commit）。

## 边界

- 只读扫描脚本不修改任何文件；auto-fix 仅改目标源码与测试，不碰第三方/`node_modules`/生成产物。
- 不主动重构无关代码；不越权改接口契约（需结构性决策时停下问人）。
- 不 push（除非用户显式要求）。

## 参考

- `references/ts-review-checklist.md` — 审查维度细则
- `references/ts-optimize-checklist.md` — 优化维度细则
- `scripts/code-quality-scan.mjs` — 只读静态反模式扫描器
