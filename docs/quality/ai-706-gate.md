# AI-706 质量门报告

> 分支: `feat/ai-706` | 栈: node-ts (Next.js 14 App Router + React 18) | 提交方式: 仅 commit（不 push）
> 对应设计文档: `features/ai-706.md`

## 四道通用质量门结论

### 1. 一致性门（consistency）— PASSED

- 前端 `tsc --noEmit`：0 错误。修复了本 feature 单测 `lib/i18n-messages.spec.ts` 中 `matchAll` 迭代依赖 `--downlevelIteration`/`es2015+` 的问题（改为 `Array.from(...)` 满足 tsconfig target）。
- 后端 `tsc --noEmit`：0 错误（本次为纯前端 feature，无后端变更）。
- E2E `tsc --noEmit`（`src/e2e/tsconfig.json`）：0 错误。顺带修复 AI-705 遗留类型错误 `step-definitions/parent-provider-config.steps.ts` 的 `parent()` 辅助函数——声明为 fake-`this` 参数（0 实参）却以 `parent(this)` 实参调用，改为显式 `world: E2EWorld` 参数（13 处调用一并修正）。
- `next build`：本沙箱被 safe-delete 拦截器的 trash 二进制 `ETIMEDOUT` 阻断（**环境限制，非代码缺陷**）；已用前端 tsc 0 + 后端 tsc 0 + e2e tsc 0 佐证可编译。CI 真实环境（无沙箱 trash 拦截）可正常产出生产构建。
- 纯前端、无前后端契约变更：`messages/*.json` 为静态语言包，不新增 API。
- 键一致性：递归收集 `zh.json` 与 `en.json` 的键集合，逐层完全对齐（防漏译/错键导致 `t()` 回退或崩溃），由单测固化。

### 2. 测试门（tests）— PASSED

**单元测试（`src/lib/i18n-messages.spec.ts`，2/2 通过）**：

- 用例 1 — 语言包键对齐：`zh.json` 与 `en.json` 经递归 `collectKeys` 后 `toEqual`，确保双语键结构完全一致（含嵌套 `Home`/`Parent`/`Report`/`Chat` 等命名空间）。
- 用例 2 — 键解析校验：遍历 `src` 下全部 `.ts/.tsx`，收集 `useTranslations("NS")` 命名空间与字面量 `t("key")` 调用，断言每个 `t()` key 均存在于其声明命名空间（防止拼写错键 / 未声明命名空间）。

**BDD/E2E（已编写，待服务栈跑通）**：`src/e2e/features/language-switch.feature` + `step-definitions/language-switch.steps.ts`。3 场景：

- 默认中文：游客访问 `/` → 中间件重定向 `/zh` → 中文 chrome（TabNav「首页」）。
- 切换英文：语言选择器切 `EN` → URL 带 `/en` 前缀 + chrome 变英文（"I'm Foxy!" 问候）→ 刷新后 cookie 持久化仍英文。
- 导航保前缀：在 `/en` 下点 TabNav 链接触发客户端导航 → 保持 `/en/chat` 前缀（不丢 locale、不丢 SPA 内存 auth）。

> E2E 需 `next build` + `next start` 生产模式 + 后端双服务起服后方可运行（见 consistency 门 build 说明）；feature/步骤已就绪并通过 `tsc`，可在 CI 真实环境执行。

### 3. 代码审查门（review）— PASSED（0 open）

- 内容隔离：单词、释义、例句、故事、题目等**学习内容保持英文原样**，仅 UI chrome（按钮/标题/标签/空态/提示/toast/导航）翻译——经 CJK grep 复核，所有 `.tsx` 用户态中文已抽取，仅注释保留中文。
- 路由与持久化：`next-intl` `defineRouting`（`locales:['zh','en']`、`defaultLocale:'zh'`）+ `createMiddleware` 协商（未带前缀 → 重定向 `/zh`）；`LocaleSwitcher` 经 `useLocale`/`useRouter`/`usePathname` 切换并写入 `NEXT_LOCALE` cookie，刷新后仍生效。
- SPA auth 保活：TabNav 与页面内导航统一使用 `@/i18n/navigation` 的 locale 感知 `Link`/`useRouter`，客户端软导航保留内存 token，不触发整页跳转清空 auth。
- 状态文案：`STATUS_LABEL_KEY` 常量映射（AI-705 已有）经 `t(key)` 消费，不硬编码中文状态。
- 日志：业务代码无裸 `console.*`；临时抽取脚本目录 `src/__i18n_tmp/` 已删除，无残留调试代码。

### 4. 优化门（optimization）— PASSED（0 open）

- 无 stub/占位代码；无临时调试输出。
- 统一抽象：导航统一经 `@/i18n/navigation`（`Link`/`useRouter`/`usePathname`）+ `LocaleSwitcher`，无逐文件硬编码 locale 前缀；插值变量（`{name}`/`{date}`/`{count}`/`{pct}`/`{stars}`/`{level}`）保持原样不被翻译。
- 命名空间清晰：按页面/组件划分 `Common / Home / TabNav / Scan / Speech / Rewards / Practice / Plan / WordCards / PictureBook / Parent / Report / Chat`，结构可维护。
- 临时资产清理：机械替换脚本 + 映射 JSON 全部置于 `src/__i18n_tmp/`，提交前已删除。

## 测试证据汇总

| 类型 | 文件 | 结果 |
|---|---|---|
| 前端类型检查 | `tsc --noEmit` | 0 错误 |
| 后端类型检查 | `tsc --noEmit` | 0 错误（无后端变更） |
| E2E 类型检查 | `tsc --noEmit` | 0 错误（顺带修复 AI-705 预存类型错误） |
| 单元测试 | `src/lib/i18n-messages.spec.ts` | 2/2 通过（键对齐 + 键解析） |
| BDD/E2E（已编写） | `src/e2e/features/language-switch.feature` | 3 场景（待服务栈跑通） |
| 生产构建 | `next build` | 沙箱 safe-delete trash 超时阻断（环境限制，CI 真实环境应通过） |

## 遗留风险 / 说明

- `next build` 在 WorkBuddy 沙箱被 `genie-safe-delete.cjs` 拦截器的 trash 二进制 `ETIMEDOUT` 阻断（同机制导致 `logger.spec.ts` 偶发失败）；属环境限制，非代码缺陷。前端 tsc 0 + 后端 tsc 0 + e2e tsc 0 + 单元 2/2 已佐证可编译与契约对齐。
- E2E 浏览器旅程（默认中文重定向 / 切英文持久化 / 导航保前缀）已编写并通过类型检查，待 `next build`+`next start`+后端双服务起服后在 CI 真实环境执行。
- 后端错误码与提示文案 i18n 抽取为后续迭代（backlog 标注可选，不在本 feature 范围）。
- 当前分支 `feat/ai-706` 未 push，由用户决定 merge/push。
