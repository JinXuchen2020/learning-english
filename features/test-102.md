# TEST-102 — BDD 驱动 E2E 测试

> 状态: in-progress | 栈: node-ts (Next.js 前端 + NestJS 后端) | 分支: feat/test-102-bdd-e2e

## 1. 目标

为应用建立 **BDD/E2E 测试基线**：用 Gherkin `.feature` 描述孩子可感知的端到端用户旅程，由 Cucumber + Playwright 驱动真实浏览器串联前后端。这是 feature-builder 硬约束 #6 的落地载体——**今后每个新 feature 必须自带 BDD/E2E**，本 feature 把这套框架与现有功能的核心旅程先搭好。

> ⚠️ 不为纯后端 API 写 BDD（禁止 "Given API key / When POST /api/... / Then 200" 这类 API 级场景）。BDD 仅面向用户可感知的端到端流程，step definitions 复用页面交互而非直接调 API。

## 2. 接口契约 / 技术栈

- **E2E 框架**：`@cucumber/cucumber` (BDD) + `@playwright/test` (浏览器驱动)。
- **前端**：Next.js (App Router)，默认 `http://localhost:3000`，API base = `NEXT_PUBLIC_API_URL || http://localhost:4000/api`。
- **后端**：NestJS，全局前缀 `/api`，端口 `4000`，CORS 已允许 `localhost:3000`，DB 默认 `better-sqlite3`（零配置）。
- **Page Object 模式**：`src/e2e/support/pages/*` 封装真实 DOM 选择器（`data-component` 属性 + `#username/#password/#nickname` 输入框 + 语义文本），step definitions 只描述业务意图。

## 3. 本 feature 覆盖的用户旅程（现有页面）

现有前端页面仅 `login / page(Home) / course / practice` 四个（plan/speech/chat/report 页尚未建，见 §5 deferred）。据此设计 **4 条核心旅程、≥3 场景**：

| Feature 文件 | 旅程 | 关键断言 |
|---|---|---|
| `authentication.feature` | 注册新用户→落地首页；已注册用户登录；错误密码友好提示 | 重定向 `/`、问候语含 "I'm Foxy!"、错误 `role=alert` 文案 |
| `home-dashboard.feature` | 登录后首页展示课程与每日任务 | 3 张课程卡、3 个每日任务、问候语 |
| `task-completion.feature` | 完成一个每日任务→进度更新 | 任务 `aria-pressed=true`、完成计数 "1/3 done" |
| `course-browse.feature` | 从首页点击课程卡→进入课程详情看课时 | `CourseDetail` + `LessonList`、≥1 课时 |

种子数据（`server/src/seed.ts`）提供 3 门课程 + 3 个每日任务，使首页有真实内容可断言。

## 4. 验收标准

- [x] 4 个 `.feature` 文件，≥3 条核心用户旅程可跑通并全绿
- [x] 启动真实前后端（MockProvider 免 key；本环境用 sqlite + seed，无外部密钥）
- [x] step definitions 复用页面交互（点击/填写/断言 DOM），非直接调 API
- [x] `src/package.json` 增加 `e2e` 脚本，`npm run e2e` 可复现
- [x] BDD 场景即 E2E 验收用例，纳入质量门 `tests`

## 5. Deferred 旅程（不在本 feature，待对应页面建成后各自带 E2E）

backlog 原始描述提到「生成学习计划 → 跟读口语训练 → 查看每日 AI 小结」，但 `plan`/`speech`/`chat`/`practice`(口语)/`report` 页面属 AI 里程碑（AI-2xx/3xx/4xx/5xx），**尚未建页**。按硬约束 #6，这些旅程将在对应 feature（如 AI-207 计划页、AI-307 跟读页、AI-504 小结卡）实现时**各自自带 BDD/E2E**，不在此提前 mock。本 feature 只固化框架 + 现有页面旅程。

## 6. 测试计划（硬约束 #6）

### 单元测试
本 feature 新增的是 **E2E 基础设施**（Cucumber 配置 + 页面对象 + step definitions），无业务分支逻辑，依约定**不强制单测**（纯展示/配置型，由 E2E 自身覆盖）。前端纯逻辑 `lib/api.ts` 的单测已在 TEST-101 范围外、后续按需补。

### BDD/E2E 用户旅程
见 §3 表格，4 个 `.feature` 文件，场景覆盖：注册/登录/错误提示、首页看板、任务完成、课程浏览。

## 7. 运行方式（环境前置）

```bash
# 1) 后端：构建 + 用 sqlite + 种子数据启动 :4000
cd server
npm run build
SQLITE_PATH=/tmp/test102-e2e.sqlite DB_TYPE=sqlite npm run seed
SQLITE_PATH=/tmp/test102-e2e.sqlite DB_TYPE=sqlite PORT=4000 node dist/main &

# 2) 前端：dev 启动 :3000（默认指向 http://localhost:4000/api）
cd src
npm run dev &

# 3) E2E（需先 npm install 装好 @cucumber/cucumber + @playwright/test；浏览器复用本机 Microsoft Edge，
#    通过 channel:'msedge' 启动，无需 npx playwright install chromium 下载 Chromium）
cd src
npm run e2e
```

CI 建议（参见未落地的 `.github/workflows/ci.yml` 讨论）：PR 到 master 时跑 `server` 单测 + 上述 E2E，门禁双保险。

## 8. 质量门（Phase 4 嵌入）

- consistency: PASSED（前端 `next build` / 后端 `nest build` + 启动 :4000 sqlite+seed 全绿；E2E 串联真实前后端全绿）
- tests: PASSED（unit: 0 新文件 — 纯 E2E 基建；e2e/bdd: **4 features / 6 scenarios / 27 steps 全绿**，浏览器用本机 Edge 经 `channel:'msedge'`，无需下载 Chromium）
- review: PASSED（0 open；已修订登录页双 `Sign In` 选择器歧义，改用 `button[aria-pressed]` 切 tab、`form button[type=submit]` 提交）
- optimization: PASSED（0 open；单浏览器复用 + 每场景隔离 context；hooks 设 60s 超时容错）

### 实测运行结果
```
6 scenarios (6 passed)
27 steps (27 passed)
0m13.201s
```
详见 `docs/quality/test-102-gate.md`。
