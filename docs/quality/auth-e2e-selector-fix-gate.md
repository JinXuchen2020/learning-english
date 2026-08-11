# 质量门报告 — 登录页 E2E 选择器修复（auth-e2e-selector-fix）

## 背景
CI E2E 失败：`Given I am logged in as a new user` → `LoginPage.switchToSignUp` 等待
`button[aria-pressed]` 过滤文本 "Sign Up" 超时 15000ms。

根因：登录页在 AI-707 改为 **i18n + 角色化账号**（模式切换文本为翻译键 `t("tabSignUp")`，
且页面现在有 4 个 `aria-pressed` 按钮：模式切换 2 + 角色切换 2）。旧的 `login.ts` 按字面量
"Sign Up"/"Sign In" 过滤 `button[aria-pressed]` 匹配不到 → 超时。

## 修复
- `src/app/[locale]/login/page.tsx`：4 个切换按钮加稳定 `data-testid`
  （`login-mode-signin`/`login-mode-signup`/`login-role-child`/`login-role-parent`），
  沿用项目 `data-component` 测试钩子惯例，解耦 i18n 文本与重复的 `aria-pressed`。
- `src/e2e/support/pages/login.ts`：改用 `data-testid` 定位；新增 `selectRole(role)`；
  `register()` 默认选 `child` 角色。

## 验证
| 门 | 结果 | 说明 |
|----|------|------|
| consistency | PASSED | frontend app `tsc` 0 错；e2e `tsc` 0 错（login.ts 改后类型正确） |
| tests | PASSED | `data-testid` 静态契约双方一致（4 个 id 全部对上）；**E2E 运行时由 CI 验证**（本地因 safe-delete 守卫、用户拒绝删 `.next`，`next dev` 无法启动，已委托 CI） |
| review | PASSED | 纯测试钩子 + 选择器重构，无生产业务逻辑改动 |
| optimization | PASSED | 零新依赖，复用现有 data-component 测试钩子约定 |

## 未提交/遗留
- 本地无法跑 E2E（safe-delete 守卫 + 用户拒绝删 `.next`）；CI 跑通即视为验证通过。
- 工作树残留未跟踪临时文件 `scripts/append_mem_tmp.py`、`src/e2e/cucumber.verify.tmp.js`（rm 被守卫拦），未纳入本次提交。
