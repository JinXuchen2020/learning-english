# AI-605 质量门报告 — AI 复习提醒（间隔重复）

- **Phase**: ai-605
- **Stack**: node-ts (NestJS 10 + TypeORM + better-sqlite3 / Next.js 14)
- **Branch**: feat/ai-605（从当前分支派生；提交不 push，merge/push 由用户决定）
- **日期**: 2026-08-09
- **Gate 文件**: `.quality-gate.json`（扁平，`cleared:true`，`enforced:true`）

## 四道质量门结论

| 门 | 结论 | 关键证据 |
|----|------|----------|
| consistency | ✅ PASSED | 后端 `tsc -p tsconfig.json --incremental false` 全量类型检查 EXIT 0（0 错误）；前端 `next build` 类型检查 0 错误（**13 路由**编译成功，含 `/practice`）；全栈契约对齐：`DueReview`/`ReviewSettings` 两端一致（`server/src/progress/progress.service.ts` 与 `src/lib/types.ts` 同口径）；`GET /progress/review/due` 与前端 `getDueReviews(userId, date?)` 路径/参数一致；`GET /progress/review/settings` 与 `getReviewSettings(userId)` 对齐；`POST /progress/review/schedule` 与前端注入复习项（`DailyTaskView.reviewWordText` → `/practice?focusWord=` 深链）对齐；`WordProgress` 实体加 `intervalDays`/`easeFactor`/`reviewCount`/`dueDate` 四列并随 `synchronize:true` 自动建列 |
| tests | ✅ PASSED | **unit**: 后端 `review-schedule.util.spec`（env 解析/回退；正确阶梯/clamp 越界/ease 上下限/错误重置/默认 now+intervals）+ `progress.service.spec`（getDueReviews queryBuilder where+leftJoin+排序/空数组；scheduleReview 更新/404）+ `progress.controller.spec`（review 三路由）+ `tasks.service.spec`（注入 review 链接项/注入失败容错）共 **54 PASS**；前端 `vitest` 全量 **100 PASS**；**e2e/bdd**: `review-reminder.feature` **1 scenario / 6 steps 全绿**（登录新用户→seed 到期词 Cat→看到复习卡≥1 词→当日任务含复习项→点第一条复习词链接→落到练习页 for Cat），数据钩子 `ReviewReminderCard`/`ReviewWordLink`/`ReviewTaskLink`/`DailyTasks`/`WordPractice` 可断言；step 文本唯一无 ambiguous；复习词链接用 Next.js `<Link>` + `force:true` 规避卸载竞态 |
| review | ✅ PASSED | 0 open；`getDailyTasks` 注入到期复习项**现场附加不落库**、失败 `try/catch` 容错**绝不阻断主任务列表**；`computeNextReview` 纯函数单一真相（`easeFactor` 钳制 `1.3–3.0`，间隔阶梯 `DEFAULT_REVIEW_INTERVALS=[1,2,4,7,15,30,60]` 可经 `REVIEW_INTERVALS` 环境变量配置）；`scheduleReview` 仅操作自己 `userId` 下词、不存在转 `404` 不 5xx；复习项渲染为**深链非完成按钮**（避免污染完成态）；无裸 console |
| optimization | ✅ PASSED | 0 open；间隔重复算法纯函数化（`review-schedule.util`）可单测；复习项服务端现场附加避免 `daily_tasks` 重复行/完成态耦合；节奏可配置（`REVIEW_INTERVALS`）满足「提醒时机可配置」验收；无 stub；到期词用 `leftJoin Word` 一次查询取文本/释义 |

## 本次新增/修改文件

**后端（新增/修改）**
- `server/src/entities/word-progress.entity.ts`（改）— 加 `intervalDays`(int,0) / `easeFactor`(float,2.5) / `reviewCount`(int,0) / `dueDate`(datetime,nullable) 四列
- `server/src/progress/review-schedule.util.ts`（新）— `DEFAULT_REVIEW_INTERVALS=[1,2,4,7,15,30,60]` / `EASE_FACTOR_MIN=1.3` / `EASE_FACTOR_MAX=3.0` / `loadReviewIntervals()`（读 `REVIEW_INTERVALS` env，非法回退默认）/ `computeNextReview(input): ReviewState`（正确→reviewCount+1/ease+0.1/interval=intervals[min(reviewCount-1,len-1)]；错误→reviewCount=0/ease-0.2/interval=intervals[0]；dueDate=now+intervalDays*DAY_MS）
- `server/src/progress/dto/schedule-review.dto.ts`（新）— `ScheduleReviewDto { @IsString()@IsNotEmpty() wordId; @IsDateString() dueDate }`
- `server/src/progress/progress.service.ts`（改）— `recordWordAttempt` 算复习状态写四列；新增 `getDueReviews(userId,date?)`（leftJoin Word，where `dueDate IS NOT NULL AND dueDate<=date` 升序）/ `getReviewSettings()` / `scheduleReview(userId,wordId,dueDate)`（找不到返回 null）
- `server/src/progress/progress.controller.ts`（改）— 新增 `GET review/due` / `GET review/settings` / `POST review/schedule`（service 返回 null→`NotFoundException`）
- `server/src/progress/progress.module.ts`（改）— `exports: [ProgressService]`
- `server/src/tasks/tasks.service.ts`（改）— 注入 `ProgressService`，`getDailyTasks` 末尾 try/catch 把到期词 push 为 review 链接任务（容错）
- `server/src/tasks/tasks.module.ts`（改）— `imports` 加 `ProgressModule`
- `server/src/progress/review-schedule.util.spec.ts`（新）— 覆盖 loadReviewIntervals / computeNextReview 全部分支
- `server/src/progress/progress.service.spec.ts` / `progress.controller.spec.ts` / `tasks.service.spec.ts`（改）— 加 review 相关用例（共 54 PASS）

**前端（新增/修改）**
- `src/lib/types.ts` — 加 `DueReview` / `ReviewSettings`；`DailyTask.icon` 增 `"review"` + `reviewWordText?`
- `src/lib/api.ts` — 加 `getDueReviews(userId, date?)` / `getReviewSettings(userId)`
- `src/app/page.tsx`（改）— `load()` 并行拉 `getDueReviews(user.id)`；渲染 `ReviewReminderCard`（data-component）+ 把 `DailyTasks` 中注入的复习项渲染为 `/practice?focusWord=` 深链（`ReviewTaskLink`）

**E2E（新增）**
- `src/e2e/features/review-reminder.feature`（新）+ `src/e2e/support/pages/review.ts`（新）+ `src/e2e/step-definitions/review-reminder.steps.ts`（新）— 1 scenario / 6 steps
- `src/e2e/cucumber.review-reminder.js`（新）— 仅跑 review-reminder 单 feature 的专用配置
- `src/e2e/support/seed.ts`（改）— 加 `seedDueReview(user, word)`（login→recordWord correct→POST review/schedule 设昨天到期）
- `src/e2e/support/pages/home.ts`（改）— 加 `bounceToHome()`（TabNav 客户端导航重挂 Home，token 仅内存不整页刷新）

**文档**
- `features/ai-605.md`（设计文档，状态 → done）
- `docs/quality/ai-605-gate.md`（本报告）
- `features/backlog.md` — AI-605 → `done`

## 关键修复 / 环境坑（本次踩到并固化）

1. **`TasksService` 注入 review 项时本地 task 类型缺 `reviewWordText`**（✅ 已修）。`getDailyTasks` 的 `base` 数组原推断类型不含 `reviewWordText`，push 带 `reviewWordText` 的对象报 `TS2353`。修复：新增 `DailyTaskView` 接口（含可选 `reviewWordText`）并显式标注 `base: DailyTaskView[]`；spec 的 `reviewItem` 改为 `as any` 消除「possibly undefined」。

2. **jest / tsc 不能用 `.bin/*` bash 脚本**：`node ./node_modules/.bin/jest` / `.bin/tsc` 报 `SyntaxError`（bash 脚本）。改用 `node ./node_modules/jest/bin/jest.js` / `node ./node_modules/typescript/lib/tsc.js` 入口；cucumber 用 `node ./node_modules/@cucumber/cucumber/bin/cucumber.js`。

3. **E2E 端口被上次会话遗留 server 占用 + DB 锁**：`:4000`/`:3000` 被之前会话进程占用（`EADDRINUSE`）并持 `dev.sqlite` 写锁。`TaskStop` 偶尔不彻底，须 `netstat -ano | grep -E ':4000|:3000'` 定位 + `taskkill /PID <id> /F` 强制杀，再启本会话服务。

4. **E2E 用 `next build` + `next start` 生产模式**（`:3000` 预编译毫秒级响应）替代 `next dev`（按需编译卡死整台 server）。

5. **`server/.env` 默认 `AI_PROVIDER=bigmodel` 无 key**：真实调用返回空 → 降级。E2E 后端须 `AI_PROVIDER=mock` 启动走 MockProvider fixture 验证真实生成/落库路径。

6. **token 仅模块内存 → seed 后必须客户端导航重挂 Home**：`page.reload()` 清空登录态。E2E seed 后调 `HomePage.bounceToHome()`（TabNav 先走 `/practice` 再回 `/`，`force:true` 规避 `<Link>` 卸载竞态）重新挂载 Home 以拉取新播种的到期复习词，绝不整页刷新。

7. **跨模块依赖**：`TasksModule` 需 `import ProgressModule` 才能注入 `ProgressService`；`ProgressModule` 单向 `exports: [ProgressService]`，无环。

## 验证

- 后端 `tsc -p tsconfig.json --incremental false`：EXIT 0，0 错误。
- 后端 jest（review-schedule / progress / tasks 相关）：**54 PASS**（含 computeNextReview 全部分支 + getDueReviews/scheduleReview + tasks 注入/容错）。
- 前端 `vitest` 全量 **100 PASS**；`next build` 0 错误（13 路由编译成功）。
- 前端 `next build` + `next start` 生产模式启动正常（:3000 listening）；后端 `node dist/main.js`（Node 20，`AI_PROVIDER=mock`）启动（:4000，`/progress/review/due` 等新路由已映射）。
- E2E `review-reminder.feature`：**1 scenario / 6 steps 全绿**（404 为 favicon 无害）。

四质量门 + 提交（不 push）放行。
