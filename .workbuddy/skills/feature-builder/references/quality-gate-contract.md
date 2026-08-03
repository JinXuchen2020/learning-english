# 质量门禁契约（feature-builder 引用，通用版）

本文件定义 feature-builder 在 Phase 4/5/6 满足的提交契约。本契约**与具体项目解耦**：`.quality-gate.json` 始终产出，且 skill 在 **Phase 0.1b 自动安装**通用 pre-commit hook 并设 `core.hooksPath`，因此质量门为**默认强执**（无需项目侧预先配置）。Phase 4 执行前先读本文件。

## 1. 提交契约（默认强执，由 skill 自动安装 hook）

skill 在 Phase 0.1b 检测到项目无质量门 hook 时，静默写入 `scripts/git-hooks/pre-commit`（内容见 SKILL.md 附录 D）并 `git config core.hooksPath scripts/git-hooks`。此后凡 `git diff --cached` 含源码改动，提交必须满足：
- 必须同时暂存 `.quality-gate.json`，否则拒绝（提示「质量门未通过：未一同暂存」）。
- `.quality-gate.json` 中 `"cleared"` 必须为 `true`，否则拒绝。
- `gates` 对象中 `consistency` / `tests` / `review` / `optimization` 四字段均须为 `PASSED`，否则拒绝。

（仅改 docs/、设计文档、`.quality-gate.json` 自身、质量报告、hook 文件等纯文档/配置改动不受此门限制。）

若因特殊原因 hook 未生效（如用户手动移除、或 `core.hooksPath` 被改指向他处未合并），`.quality-gate.json` 仍产出并标注 `"enforced"` 真实值；此时强执失效，仅作记录。

手动（重）安装（如需）：`git config core.hooksPath scripts/git-hooks`；hook 文件已随仓库提供，无需额外下载。

## 2. .quality-gate.json 字段契约（通用）

```json
{
  "phase": "<feature-id>",
  "stack": "<Phase 0 探测到的栈，如 node-ts / dotnet / python / go>",
  "gates": {
    "consistency":  "PASSED (<构建/类型/测试/契约对齐结论>)",
    "tests":        "PASSED (unit: <n> files; e2e/bdd: <n> scenarios)",
    "review":       "PASSED (0 open; <关键修复点>)",
    "optimization": "PASSED (0 open; <清理项>)"
  },
  "cleared": true,
  "enforced": true,
  "reportRef": "docs/quality/<feature-id>-gate.md",
  "notes": "<实现摘要：后端/前端/测试证据>"
}
```

注：`gates` 四字段内容给人看的摘要，但**字段名本身必须存在**；`cleared` 是唯一的布尔强执点（仅在有 hook 时）。设计决策豁免须在对应门结论里显式标注「N open（M 项设计决策豁免）」，不得静默清零。**`tests` 为硬门槛**：新 feature 缺单元测试或 BDD/E2E 不得标 PASSED，除非设计文档显式标注 legacy 测试豁免（历史功能由 backlog TEST-101/TEST-102 统筹补齐）。

## 3. 提交信息格式（约定，含 Quality-Gate: 行）

```
feat(<feature-id>): <一句话描述>

Quality-Gate: consistency + tests + review + optimization PASSED (cleared:true, stack=<栈>)
- 实现：...
- 测试：单元测试 <n> 文件全绿；BDD/E2E <n> 场景跑通（或 legacy 豁免说明）
- 一致性：<构建/类型/测试/契约对齐结论>
- 质量门：四道通用门全绿（含 tests，0 open）
```

缺 `Quality-Gate:` 行虽不触发强执拒绝，但属约定，必须带，便于回溯。

## 4. 四道通用质量门（不依赖特定子 skill）

本 skill Phase 4 用通用方式实现，按严格顺序：
1. **consistency** —— 消费 Phase 2 的构建/类型/测试/契约结果，全绿方可 PASSED。
2. **tests** —— 本 feature 的测试证据：（a）单元测试——本 feature 新增/修改的源码有对应 `*.spec.ts`（或栈对应测试文件），`${TEST_CMD}` 全绿；（b）BDD/E2E——本 feature 涉及的用户旅程有对应 `*.feature` + step definitions，`${E2E_CMD}` 跑通（MockProvider/模拟数据免 key 亦可）。**无测试不得 PASSED**（除非设计文档显式标注 legacy 豁免）。
3. **review** —— 用 SKILL.md 附录 B 的通用对抗式 checklist 逐条自查，修复至 0 open。
4. **optimization** —— 生产就绪 pass（stub 替换/清理/统一错误处理），跑至 0 open。

> 可选增强：项目若已配置专属质量 skill（如 `ddd-code-reviewer`/`codebase-optimizer`），可在对应门后追加调用其结论写入字段；但**默认不依赖**，缺失按通用 checklist 执行即可。
每道门跑完把结论浓缩进 `.quality-gate.json` 对应字段。

## 5. check-in 暂存清单（建议一起 git add）

- 所有源码改动
- **测试文件**（`*.spec.ts` / `*.test.*` / `*.feature` / step definitions）
- `.quality-gate.json`（已 `cleared:true` + `gates` 四字段）
- `features/<feature-id>.md`（设计文档，含测试计划）
- `docs/quality/<feature-id>-gate.md`（质量报告）
- Phase 5 的文档同步改动

遗漏任一项 → 被 pre-commit 拒绝，或后续审计断链。

## 6. 失败回退

若 `git commit` 被 pre-commit 拒绝：
- 报「未一同暂存」→ 确认 `.quality-gate.json` 已 `git add`。
- 报「cleared 非 true」→ 回到 Phase 4 把四道门跑至 0 open 再置 `cleared:true`。
- 报「缺 gates 字段」（含 `tests`）→ 补跑对应门并写入字段；`tests` 缺失/非 PASSED 须补齐单元测试或 BDD/E2E（或设计文档标注 legacy 豁免）。
