---
name: feature-builder
description: 通用 feature 端到端自主开发流程，自动适配任意技术栈（Node/TS、.NET、Python、Go、Rust、Java、PHP…）。从 features/ 设计枢纽取一个 feature（或用户即时指令），完成实现 + 单元测试 + BDD/E2E + 构建/类型一致性校验 + 四道通用质量门禁（一致性/测试/代码审查/优化），全绿后同步项目文档并自动 git commit（不 push）。**新 feature 必须自带单元测试与 BDD/E2E 并纳入门禁**。启动阶段自动检测并静默安装质量门 pre-commit 强执 hook（幂等、跨平台），使质量门默认真阻断源码提交。This skill should be used when 用户要求「端到端实现一个完整 feature」「从 backlog 取任务做全栈/单栈开发并自动 check-in」「开发联动功能且保证一致性」「做一个功能并自动提交」。
agent_created: true
---

# feature-builder — 通用 feature 端到端自主开发

本 skill 是「功能自主迭代」的生成层：让代理把一个 feature 从设计文档变成可运行、经验证、经质量门禁后安全 check-in 的真实功能。**与具体项目解耦**——它只规定流程纪律，所有技术细节（构建/类型检查/测试/目录约定/文档清单）都由 **Phase 0 栈探测** 注入为 `${变量}`，命令与路径一律用变量，禁止写死。

## 设计原则（为什么能跨项目直接跑）

1. **流程纪律与栈无关**：分支硬约束、features/ 设计枢纽、设计文档红线、质量门概念、文档同步、commit 不 push——这些在任何项目都成立。
2. **技术细节变量化**：所有命令/路径/约定以 `${变量}` 引用，由 Phase 0 探针根据仓库实际写入。绝不在正文写死框架名、端口、Cookie 名、组件名、文档名。
3. **启动即强执质量门 hook（静默、幂等）**：Phase 0 检测到项目未配置质量门 pre-commit hook 时，skill 自动写入通用 `scripts/git-hooks/pre-commit` 并 `git config core.hooksPath scripts/git-hooks`，使质量门**默认真阻断**源码提交（详见 Phase 0.1b）。已存在等价 hook 则不重复写入；`core.hooksPath` 已指向他处则覆盖并在收尾说明。专职质量 skill 缺失则按通用 checklist 执行（不阻断）。
4. **质量门纯通用**：四道门（一致性 / **测试** / 代码审查 / 优化）用本 skill 内置 checklist + 构建/类型检查 + 测试运行实现，不依赖任何特定子 skill（如 ddd-*）。若项目已配置专属质量 skill，可**可选**追加，但默认不依赖。
5. **测试随 feature 交付**：每个新 feature 必须自带单元测试与 BDD/E2E（见硬约束 #6），二者是 `tests` 门的证据，缺测不得 check-in。

## 何时用

- 用户要求「端到端实现 X feature」「从 backlog 取任务做开发并自动 check-in」「做一个功能并自动提交」。
- 用户希望一次性完成后端 + 前端（如适用）+ 联调/一致性 + 测试 + 质量门禁 + 提交。
- 不适用：纯咨询/只审查代码 → 直接做，不必走完整流程；用户明确不要提交 → 停在 Phase 6 之前。

## 前置约定（硬约束）

1. **features/ 是跨栈设计枢纽**：新 feature **先写设计文档** `features/<feature-id>.md`（目标 / 接口契约 / 数据模型 / 验收标准 / 风险点），再进入实现。红线，不可选。若仓库无 `features/` 目录则新建。
2. **质量门契约（启动强执）**：改动源码的提交必须把 `.quality-gate.json` 一起暂存且 `cleared:true`、`gates`（consistency / tests / review / optimization）四字段 `PASSED`（见 `references/quality-gate-contract.md`）。Phase 0 已自动确保 pre-commit hook 到位，缺门禁会被 hook 拒绝。
3. **提交信息含 `Quality-Gate:` 行**（约定，便于回溯）。
4. **每个 feature 独立分支（硬约束）**：任何写操作前先建并切到 `feat/<feature-id>`；分支从当前分支新建，**不主动 merge、不主动 push**（merge/push 由用户决定）。目的：隔离改动便于 review，避免误落他人分支。
5. **完成后必须同步文档（硬约束）**：代码与质量门全绿后、check-in 前，把「现有项目文档」同步到最新代码，杜绝历史漂移（重点核查检测到的 `${DOC_FILES}`，凡描述已被本 feature 改变的旧机制 → 改为真实实现）。文档改动随本 feature 一起 commit 在 `feat/<feature-id>` 分支。
6. **测试随 feature 交付（硬约束）**：每个新 feature 必须同时交付（1）**单元测试**——覆盖本 feature 新增/修改的源码，运行 `${TEST_CMD}` 全绿；（2）**BDD/E2E 场景**——用 BDD 框架（如 `@cucumber/cucumber`）写 Gherkin `.feature` 描述**用户可感知的端到端旅程**，由 E2E 驱动（如 Playwright）串联真实/模拟前后端，**不为纯后端 API 写 BDD**（禁止 "Given API key / When POST /api/... / Then 200" 这类 API 级场景）。二者作为 Phase 4 `tests` 门证据，缺测不得 check-in。历史遗留功能由 backlog TEST-101/TEST-102 统筹补齐，可在设计文档显式标注「legacy 测试豁免」。

## 流程（严格顺序）

### Phase 0 — 栈探测 + 取 feature + 设计

**0.1 栈探测（必做，决定后续所有变量）**。在仓库根执行检测，确定 `${STACK}` 与下列变量；检测不到的项留空（空项对应的步骤自动跳过/降级）：

| 探测标记 | ${STACK} | ${BUILD_CMD} | ${TYPECHECK_CMD} | ${TEST_CMD} | ${E2E_CMD} |
|---|---|---|---|---|---|
| `package.json`（含 `next`/`@nestjs/core`/`react`/`vue`/`vite`/`express`…） | node-ts | `npm run build`（无脚本则 `npx <fw> build`） | `tsc --noEmit`（无 ts 则 `npm run typecheck`） | `npm test` / `vitest` / `jest`（按依赖） | `playwright` / `cucumber`（按依赖） |
| `*.csproj` / `*.sln` | dotnet | `dotnet build` | （编译即类型检查） | `dotnet test` | `specflow` / `playwright`（按依赖） |
| `pyproject.toml` / `requirements.txt` | python | （视打包方式，可空） | `mypy .`（已装则） | `pytest` | `behave` / `pytest-bdd`（按依赖） |
| `go.mod` | go | `go build ./...` | `go vet ./...` | `go test ./...` | （可空） |
| `Cargo.toml` | rust | `cargo build` | `cargo clippy` | `cargo test` | （可空） |
| `pom.xml` / `build.gradle` | jvm | `mvn compile` / `gradle build` | （编译期） | `mvn test` / `gradle test` | `cucumber-jvm`（按依赖） |
| `composer.json` | php | （可空） | `phpstan` / `psalm`（已装则） | `phpunit` | `behat`（按依赖） |
| `Gemfile` | ruby | （可空） | `rubocop` | `rspec` / `rails test` | `cucumber`（按依赖） |

并探测：
- **前端/后端形态**：同时存在前端框架依赖与独立后端（NestJS/Express/.csproj/py）→ 视为全栈，Phase 2 必须对齐契约；monorepo 检测 `apps/` `packages/` `server/` `client/` 布局。
- **${FRONTEND_PORT}**：读 vite.config / next.config（next 默认 3000，vite 默认 5173），无则空。
- **${DOC_FILES}**：存在的 `README*`、`CHANGELOG*`、`docs/`、`features/backlog.md`、根目录其他 `*.md`——只列实际存在的。
- **${HOOKS_ENFORCED}**：`git config core.hooksPath` 或存在 `.husky`/`scripts/git-hooks` → `true`，否则 `false`。
- **${MIGRATION_CMD}**：dotnet → `dotnet ef migrations add`；其他栈一般无，留空（不强行迁移）。

把探测结果打印给用户（一句话即可），后续阶段一律用这些变量。

**0.1b 质量门强执保障（静默强制，幂等）**：若 `${HOOKS_ENFORCED}=false` →
  - 写 `scripts/git-hooks/pre-commit`（内容见附录 D：通用 POSIX `sh`，跨平台；校验「暂存区含源码改动时 `.quality-gate.json` 必须已暂存 + `cleared:true` + `gates`（consistency/tests/review/optimization）四字段 `PASSED`」）。
  - `git add scripts/git-hooks/pre-commit && git update-index --chmod=+x scripts/git-hooks/pre-commit`（确保 POSIX 可执行位，Windows 忽略此位）。
  - 设 `core.hooksPath`：`git config core.hooksPath scripts/git-hooks`（仅本 clone 本地生效，不改共享远端）。若已设且为本路径 → 跳过；若指向他处 → 覆盖并在 Phase 7 说明（可能停用项目既有 hook，需提示用户）。
  - 置 `${HOOKS_ENFORCED}=true`。
  - **幂等**：若 `scripts/git-hooks/pre-commit` 已存在则不覆盖（沿用项目现有实现，仅确保 `core.hooksPath` 指向它）。

**0.2 建专属分支（硬约束，第一动作）**：`git checkout -b feat/<feature-id>`（或 `git switch -c`）。校验 `git branch --show-current` 返回 `feat/<feature-id>`。若已在该分支跳过；若已存在且非目标 → `git branch -D` 后重建或加日期后缀，不得落非 feature 分支。

**0.3 取 feature**：读 `${DOC_FILES}` 中的 backlog（若存在）取最靠前未完成任务；或采用用户当轮明确指令；或用户已提供的 `features/<feature-id>.md`。

**0.4 写设计文档**（若还没有）：`features/<feature-id>.md`，含接口契约、数据模型、验收标准、风险点、**测试计划**（本 feature 的单元测试点 + BDD/E2E 用户旅程清单）。可用附录 A 模板。**高风险管理**：涉及接口契约变更/鉴权角色/路由结构/破坏性改动/删数据 → 先汇报选项等确认再动手。纯新增、不破坏既有契约可直接进入实现。

**0.5** backlog 任务状态改 `doing`（Edit 对应文件）。

### Phase 1 — 实现（按栈）

- 用 Phase 0 探测到的栈与分层约定。无强制分层要求；若项目已有明显分层（如 NestJS modules、DDD、MVC），沿用之，不强行套用别的栈的架构。
- 新数据模型/表变更且栈有迁移机制（如 dotnet/EF）→ 跑 `${MIGRATION_CMD}`，漏迁移会导致拿不到表/列。
- API/数据契约：明确请求/响应模型，字段命名遵循项目既有约定（如驼峰/蛇形），用项目既有鉴权标注方式。
- 不写死密钥/连接串，用配置/环境变量。
- 不重写基础设施，不重构无关代码。
- **测试随 feature 交付（硬约束 #6）**：本 feature 新增/修改的源码必须同步编写（1）**单元测试**（`*.spec.ts` / `*.test.*`，Jest/`@nestjs/testing` 或栈对应框架），覆盖正常/边界/异常；（2）**BDD/E2E 场景**（`*.feature` + step definitions，BDD 框架 + E2E 驱动如 Playwright，描述用户可感知的端到端旅程，**不为纯后端 API 写 BDD**）。二者作为 Phase 4 `tests` 门的证据。历史遗留功能（已由 backlog TEST-101/TEST-102 统筹补齐）可在设计文档显式标注「legacy 测试豁免」，否则不得豁免。

### Phase 2 — 一致性 / 构建校验（本 skill 核心）

保证「改动能编译、全栈时契约对齐、相关测试跑通」，是 check-in 前的硬门槛：

1. 运行 `${TYPECHECK_CMD}`（若有）确保类型编译通过；运行 `${BUILD_CMD}`（若有）确保构建通过；运行 `${TEST_CMD}`（若有）跑本 feature 相关单元测试，必须全绿；运行 `${E2E_CMD}`（若有）跑本 feature 相关 BDD/E2E 场景（或经 MockProvider/模拟数据免 key 跑通）。
2. **全栈契约对齐**：若 Phase 0 判定为全栈，列出本 feature 涉及的所有后端 DTO/响应模型，与前端类型/请求处逐一比对字段名、类型、可空性、枚举值。若后端暴露 OpenAPI/Swagger（路径因栈而异，探测 `/swagger`/`/openapi.json`/`/docs` 等）→ 拉取 diff；否则人工逐字段比对。
3. 联调（仅当全栈且本地可起服务）：按 `${FRONTEND_PORT}` 起前端 dev server，确认新交互可用。
4. 任一失败 → 最小修复后重跑，直到全绿。

### Phase 3 — QA 闭环（可选，探测到才跑）

若项目根有 QA 脚本（如 `scripts/qa.*`、`qa.mjs`、`npm run qa`）→ 运行之；任一闸门 FAIL → 读报告定位根因、最小修复、重跑，至全绿或达 5 轮。无 QA 脚本 → 跳过本阶段，不报错。

### Phase 4 — 四道通用质量门（顺序跑，check-in 前置硬条件）

纯通用，不依赖任何特定子 skill。依次执行，每道门修复至通过（0 open，设计决策豁免须显式标注）：

1. **一致性门（consistency）**：消费 Phase 2 结果——`${BUILD_CMD}`/`${TYPECHECK_CMD}`/`${TEST_CMD}`/`${E2E_CMD}` 全绿，全栈契约字段对齐。结论写入 `.quality-gate.json` 的 `gates.consistency`。
2. **测试门（tests）**：本 feature 的测试证据——（a）**单元测试**：本 feature 新增/修改的源码有对应 `*.spec.ts`（或栈对应测试文件），运行 `${TEST_CMD}` 全绿；（b）**BDD/E2E**：本 feature 涉及的用户旅程有对应 `*.feature` + step definitions，运行 `${E2E_CMD}` 跑通（MockProvider/模拟数据免 key 亦可）。**无测试不得 PASSED**（除非设计文档显式标注 legacy 豁免，由 backlog TEST-101/TEST-102 统一补齐）。结论写入 `gates.tests`，注明单元文件数与 E2E 场景数。
3. **代码审查门（review）**：用附录 B 的**通用对抗式 checklist** 逐条自查（边界/空安全/错误处理/注入安全/死代码/魔法值/日志/并发），消灭 open findings 至 0。结论写入 `gates.review`。
4. **优化门（optimization）**：生产就绪 pass——替换 stub/占位、清理未用导出、统一错误处理、移除临时调试代码，跑到 0 open。结论写入 `gates.optimization`。

> 可选增强：若项目已配置专属质量 skill（如 `ddd-code-reviewer`），可在对应门后追加调用其结论；但**默认不依赖**，缺失按通用 checklist 执行即可。

四道门结论写入 `.quality-gate.json`（字段见 `references/quality-gate-contract.md`）：`cleared:true`、`enforced:${HOOKS_ENFORCED}`、`reportRef:docs/quality/<feature-id>-gate.md`、`notes`=实现摘要（含测试证据）。同时写 `docs/quality/<feature-id>-gate.md` 质量报告。

### Phase 5 — 文档同步（硬门槛，check-in 前置）

代码与质量门全绿后、提交前，**必须**把现有项目文档同步到最新代码：

1. **核查范围** = 探测到的 `${DOC_FILES}`。用 Grep 定位漂移：凡文档仍描述已被本 feature 改变的旧机制（旧的 API 示例 / DTO 字段 / 配置名 / 未实现的接口 /「待落地」「未完成」模块）→ 改为真实代码现状；本 feature 新增的接口/配置/模型须补进对应文档。
2. **更新 backlog**：本 feature 状态标 `done`。
3. **不造文档**：只同步真实存在的代码状态，不写未实现功能、不夸大。
4. **doc-only 也落 feature 分支**：文档改动随本 feature 一起 commit 在 `feat/<feature-id>` 分支。

### Phase 6 — 自动 check-in（仅 commit，不 push）

当前已在 Phase 0 的 `feat/<feature-id>` 分支，本阶段不切换分支。

1. `git add` 所有源码改动 + 测试文件（`*.spec.ts` / `*.feature` / step definitions）+ `.quality-gate.json` + 设计文档 + 质量报告 + Phase 5 文档同步改动 + `scripts/git-hooks/pre-commit`（若 Phase 0.1b 新写入，随本 feature 提交以固化强执）（**一起暂存**）。
2. 提交信息格式（通用）：
   ```
   feat(<feature-id>): <一句话描述>

   Quality-Gate: consistency + tests + review + optimization PASSED (cleared:true, stack=<${STACK}>)
   - 实现：...
   - 测试：单元测试 <n> 文件全绿；BDD/E2E <n> 场景跑通（或 legacy 豁免说明）
   - 一致性：<构建/类型/测试/契约对齐结论>
   - 质量门：四道通用门全绿（含 tests，0 open）
   - 文档：已同步 <${DOC_FILES}> 至最新实现
   ```
3. `git commit`（**不 push**）。
4. 失败处理：若 pre-commit 拒绝（缺 `.quality-gate.json`/cleared 非 true/某 gate 非 `PASSED`，含 `tests`）→ 回到 Phase 4 补齐后重提。

### Phase 7 — 收尾

- backlog 任务标 `done`（若 Phase 5 未标）。
- 中文总结：做了什么、改了哪些文件、测试覆盖（单元文件数/E2E 场景数）、一致性如何校验、质量门是否全绿、文档同步了哪些、遗留风险、当前分支（未 push）、**质量门 hook 状态**（若 Phase 0.1b 新装 → 说明；若覆盖了既有 `core.hooksPath` → 明确提示用户）。

## 护栏（不可越界）

- **高风险停下问人**：接口契约变更、鉴权/角色、路由结构、破坏性后端改动、删数据 → 先汇报选项等确认，不自动改。
- 不破坏现有功能：一致性 + 测试 + 质量门全绿才算完成。
- 不借机重构无关代码。
- 绝不自创需求（只做 backlog / 用户指令 / 设计文档里的）。
- 不 push（除非用户明确要求）；也不主动 merge 到其他分支。

## 附录 A — 通用设计文档模板（`features/<feature-id>.md`）

```markdown
# <feature-id> — <标题>

> 状态: in-progress | 栈: <${STACK}> | 分支: feat/<feature-id>

## 1. 目标
<一句话 + 用户价值>

## 2. 接口契约
### 后端（如有）
- 路由/方法/请求体/响应体（字段名+类型+可空）
### 前端（如有）
- 调用点 / 类型定义 / 状态管理

## 3. 数据模型
<实体/表/字段；迁移命令>

## 4. 验收标准
- [ ] <可验证条件>

## 5. 风险点
<高风险项 + 缓解>

## 6. 测试计划（硬约束 #6）
### 单元测试
- <待测源码/模块 + 覆盖路径（正常/边界/异常）>
### BDD/E2E 用户旅程
- <Gherkin 场景：用户可感知的端到端流程，不为纯 API 设计>

## 7. 质量门（Phase 4 嵌入）
- consistency: <结论>
- tests: <结论：unit <n> files; e2e/bdd <n> scenarios>
- review: <结论，0 open>
- optimization: <结论，0 open>
```

## 附录 B — 通用对抗式代码审查 checklist（Phase 4 门 3）

逐条自查，任何命中即记为 open finding 并修复：

- **空安全**：可空返回值/参数是否全部处理？`null`/`undefined`/`None`/`nil` 路径有无崩溃？
- **错误处理**：外部调用（IO/网络/DB）失败是否被捕获并有意义回退？有无吞异常？
- **注入/安全**：用户输入是否经校验/转义？密钥/连接串是否走配置而非硬编码？
- **边界**：空集合/超大输入/并发/首次运行（无数据）是否健壮？
- **死代码/魔法值**：有无未用导出、写死的端口/路径/ID？常量是否提取？
- **类型契约**：全栈字段名/类型/可空/枚举是否对齐？有无 `any`/隐式类型绕过？
- **日志/可观测**：关键失败有无日志？有无泄露敏感信息的日志？
- **一致性**：命名/分层/目录是否贴合项目既有约定（由 Phase 0 探测）？
- **测试面**：本 feature 新增/修改的源码是否都有对应单元测试？用户旅程是否有 BDD/E2E 覆盖？

## 附录 C — 通用 `.quality-gate.json` 模板

```json
{
  "phase": "<feature-id>",
  "stack": "<${STACK}>",
  "gates": {
    "consistency": "PASSED (<构建/类型/测试/契约结论>)",
    "tests": "PASSED (unit: <n> files; e2e/bdd: <n> scenarios)",
    "review": "PASSED (0 open; <关键修复点>)",
    "optimization": "PASSED (0 open; <清理项>)"
  },
  "cleared": true,
  "enforced": <${HOOKS_ENFORCED}>,
  "reportRef": "docs/quality/<feature-id>-gate.md",
  "notes": "<实现摘要：后端/前端/测试证据>"
}
```

## 附录 D — 通用质量门 pre-commit hook（Phase 0.1b 写入 `scripts/git-hooks/pre-commit`）

POSIX `sh`，跨平台（Git for Windows 自带 bash 可跑；macOS/Linux 原生）。由 skill 在 Phase 0.1b 静默写入，**不要手改逻辑**，如需调整改这里并在 Phase 0.1b 同步。

```sh
#!/bin/sh
# feature-builder 质量门 pre-commit 强执 hook（自动安装，跨平台）
# 暂存区含源码改动时，要求 .quality-gate.json 已暂存 + cleared:true + gates（consistency/tests/review/optimization）四字段 PASSED。
set -e

staged=$(git diff --cached --name-only --diff-filter=ACM)
[ -z "$staged" ] && exit 0

# 仅当存在源码改动（非纯文档/配置）才触发门禁
has_src=0
for f in $staged; do
  case "$f" in
    docs/*|.quality-gate.json|features/*.md|*.md|README*|CHANGELOG*|LICENSE*|scripts/git-hooks/pre-commit)
      ;;
    *)
      has_src=1
      break
      ;;
  esac
done
[ "$has_src" -eq 0 ] && exit 0

# 源码改动 → 要求 .quality-gate.json 已暂存
if ! printf '%s\n' "$staged" | grep -qx '.quality-gate.json'; then
  echo "质量门未通过：源码改动必须连同 .quality-gate.json 一起暂存" >&2
  echo "（feature-builder 自动安装的 pre-commit 强执）" >&2
  exit 1
fi

if ! git show :.quality-gate.json >/dev/null 2>&1; then
  echo "质量门未通过：无法读取暂存区的 .quality-gate.json" >&2
  exit 1
fi

gate=$(git show :.quality-gate.json)

if ! printf '%s\n' "$gate" | grep -q '"cleared"[[:space:]]*:[[:space:]]*true'; then
  echo "质量门未通过：.quality-gate.json 的 cleared 必须为 true" >&2
  exit 1
fi

for g in consistency tests review optimization; do
  if ! printf '%s\n' "$gate" | grep -q "\"$g\"[[:space:]]*:[[:space:]]*\"PASSED"; then
    echo "质量门未通过：gates.$g 必须为 PASSED" >&2
    exit 1
  fi
done

exit 0
```
