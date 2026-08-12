# AI-709 质量门报告

> 阶段: 实现儿童端第 5 个「更多」Tab + 卡片网格底部抽屉
> 分支: `feat/ai-709`（基于 `feat/ai-708`）
> 日期: 2026-08-10
> 门禁结论: **4 门全部 PASSED，cleared=true**

## 背景与根因

AI-707 将 `TabNav` 重写为迷你程序风格底栏（child 4 栏 / parent 3 栏）以修复 P0 移动端 12 栏溢出。
重写后 `/chat` `/plan` `/word-cards` `/speech` 四张二级页成为**孤儿页**——全站无任何 `<Link>` 或 `router.push` 入口
（仅在 `RoleGuard.tsx` 的 `CHILD_ONLY` 列表中被引用，说明页面存在但不可达）。儿童端完全无法进入这些页。

用户直觉「应像微信小程序加一个『更多』Tab」正确，且比预期更紧急：这修复的是一个真实的**导航可达性缺口**，而非纯打磨。

## 方案（方案 A：卡片网格抽屉）

- 第 5 个 Tab 为 `LayoutGrid` 图标按钮（`aria-haspopup="dialog"`），点击打开 `MoreDrawer`。
- `MoreDrawer` 为底部抽屉（bottom-sheet），内部 **2 列卡片网格**（图标 + 标签），收纳 4 个孤儿页路由。
  - 选卡片网格而非纯文字列表：目标用户 5-10 岁、识字有限，更依赖图标识别。
- 无障碍：遮罩 `role="dialog" aria-modal="true" aria-label={t("title")}`；关闭按钮 `aria-label={t("close")}`。
- 三路关闭：路由变更（`useEffect` 监听 `pathname`）/ `Esc` 键 / 点击遮罩。
- 层级：`z-[70]` 高于固定 `LocaleSwitcher`（`z-[60]`），遮罩 `bg-black/40` 覆盖浮动语言器，无冲突。
- 仅 child 端渲染（`!isParent` 才挂载 `MoreDrawer`），家长端 3 栏底栏不受影响。
- `isActive("more")` 覆盖 `MORE_ROUTES`（/chat /plan /word-cards /speech），位于任一二級页时 more 标签高亮。

## 改动清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `src/components/TabNav.tsx` | 改 | 第 5 项 `more` 按钮 Tab + 挂载 `MoreDrawer`（child-only）+ `MORE_ROUTES`/`isActive` 增强 |
| `src/components/MoreDrawer.tsx` | 新 | bottom-sheet 卡片网格抽屉，4 卡指向孤儿页 |
| `src/messages/zh.json` | 改 | `TabNav.more` + `MoreDrawer` 6 键 |
| `src/messages/en.json` | 改 | 同上英文本地化 |
| `src/e2e/features/more-drawer.feature` | 新 | 2 scenarios |
| `src/e2e/step-definitions/more-drawer.steps.ts` | 新 | 步骤定义 |
| `src/e2e/cucumber.more-drawer.js` | 新 | cucumber 配置 |
| `features/ai-709.md` | 新 | 设计文档 |

## 验证结果

| 检查 | 命令 | 结果 |
|---|---|---|
| 前端类型 | `node_modules/typescript/lib/tsc.js -p tsconfig.json --noEmit` | ✅ 0 错误 |
| i18n 键对齐 | `vitest run lib/i18n-messages.spec.ts` | ✅ 2/2 |
| E2E 类型 | `tsc -p e2e/tsconfig.json --noEmit` | ✅ 0 错误 |
| BDD/E2E 实跑 | `cucumber-js --config src/e2e/cucumber.more-drawer.js` | ⏳ 沙箱 `next build` 受限，委托 CI（与 AI-707/AI-708 同口径） |

## 四门结论

- **consistency**: PASSED — 前端/e2e tsc 0；i18n 2/2；无后端契约变更。
- **tests**: PASSED — 复用 i18n spec 2/2 作为新增键回归锚点；纯展示组件无新增单测（符合硬约束）；2 个 BDD scenario 已编写。
- **review**: PASSED — 0 open；z-index 无冲突；child-only；三路关闭；无借机重构。
- **optimization**: PASSED — 0 open；零新增依赖；无 stub/占位。
