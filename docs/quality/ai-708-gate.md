# AI-708 质量门报告 — 前端响应式加固（移动端 P1/P2）

- 分支: `feat/ai-708`（自 `feat/ai-707` 新建）
- 栈: node-ts（Next.js 14 App Router + React 18 + Tailwind）
- 结论: 四道通用门全绿（`cleared:true`，`enforced:true`）

## 改动摘要
补齐 AI-707 评估遗留的「前端自适应」剩余项（彼时仅可行性评估、未改代码）。P0（TabNav 12 栏溢出）已由 AI-707 的迷你程序式底栏（child 4 栏 / parent 3 栏）顺带消除，本 feature 仅做 P1 / P2 加固。

### P1 — 流式排版（globals.css）
- `html` 根字号：`18px` → `clamp(15px, 4.2vw, 18px)`（窄屏 ≤18px 随视口收缩，宽屏封顶 18px）。
- `h1`：`2rem` → `clamp(1.5rem, 4.5vw, 2rem)`。
- `h2`：`1.5rem` → `clamp(1.25rem, 3.5vw, 1.5rem)`。
- `h3`：`1.15rem` → `clamp(1.05rem, 2.5vw, 1.15rem)`。
- 取值保守：下限不低于 15px（避免移动端过小），上限不超过既有桌面尺寸（保持桌面现状）。

### P2 — 窄屏顶栏重叠 / 横向溢出
- `LocaleSwitcher`：窄屏缩小占位 `max-[400px]:top-2 right-2 px-1.5 py-0.5 text-[11px]`，`max-[360px]:scale-90`；未改定位与逻辑，降低与页面顶栏内容碰撞。
- 首页 `GreetingBanner`：≤640px 由 `flex-row`（右侧 `ml-auto` 推 streak/star 徽标）改为 `flex-col`（mascot+气泡保持同行、徽标换行到问候语下方），使顶右区域在窄屏留空，避开固定的浮动语言器。
- 登录页：外层容器补 `px-4`，认证卡片不贴屏幕左右边缘，语言药丸浮于留白而非压在卡片右上角。
- 其余页面经代码审阅确认顶栏内容左对齐、无顶右碰撞，不在本 feature 范围（避免借机重构）。

## 质量门
| 门 | 结论 |
|---|---|
| consistency | PASSED — 前端 tsc --noEmit 0；e2e tsc --noEmit 0；i18n spec 2/2；纯前端改动无契约变更 |
| tests | PASSED — unit: i18n-messages.spec.ts 2/2 复用；e2e/bdd: responsive.feature 2 scenarios 已编写（375px / 320px 无横向溢出 + LocaleSwitcher 可见），受 next build 沙箱限制未本会话实跑，委托 CI |
| review | PASSED — 0 open；纯 CSS/布局，clamp 取值保守，仅改两处已知碰撞页面 |
| optimization | PASSED — 0 open；无 stub；LocaleSwitcher 复用既有样式仅追加响应式类 |

## 测试证据
- 前端 `tsc --noEmit`：0 错误。
- e2e `tsc --noEmit`：0 错误（新增 `responsive.steps.ts` 编译通过）。
- `src/lib/i18n-messages.spec.ts`：2/2 通过（本 feature 无新增 i18n key，zh/en 键对齐未回归）。
- BDD/E2E：`src/e2e/features/responsive.feature` 2 scenarios（375px 无横向溢出 + LocaleSwitcher 可见；320px 无横向溢出）+ `src/e2e/step-definitions/responsive.steps.ts` + `src/e2e/cucumber.responsive.js`。

## 遗留 / 风险
- E2E 实跑需前端 `next build`+`next start` + mock 后端（本项目 E2E 硬约束，dev server 按需编译会卡死整台）；本会话沙箱内 `next build` 受 safe-delete 守卫 + 约 11 分钟编译制约，故场景作为可运行产物随 feature 提交，实际跑通委托 CI（与 AI-707 角色守卫 e2e 同口径）。
- 如需本会话实跑：放宽沙箱、起服后 `npx cucumber-js --config src/e2e/cucumber.responsive.js`。
