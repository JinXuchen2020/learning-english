# AI-308 质量门报告

> feature: `feat/ai-308` · 口语任务联动（M3 口语训练 → 每日任务闭环）
> 日期: 2026-08-06 · 栈: node-ts（Next.js 14 App Router + NestJS/TypeORM 复用）
> 质量门: consistency + tests + review + optimization — 四道全绿（cleared:true）

## 1. 交付物概览

| 文件 | 类型 | 说明 |
|---|---|---|
| `src/lib/tasks.ts` | 纯逻辑 | `isSpeakingTask(icon)` / `speakingTaskHref(taskId)`（node 直覆，零 React 依赖） |
| `src/lib/tasks.spec.ts` | 测试 | 纯逻辑全分支（5 case） |
| `src/app/page.tsx` | 修改 | 未完成的 mic 任务渲染为 `<Link href="/speech?taskId=...">`（data-speech-link + data-task-id）；其余任务维持一键完成；所有卡片带 `data-task-id` |
| `src/app/speech/page.tsx` | 修改 | `useSearchParams`（Suspense 包裹）读 `taskId`；`finished` 时 fire-and-forget `completeTask` 回写，`taskMarked` 守卫幂等；`TaskDoneNote`（"Daily task complete!"）仅在写回 resolve 后出现 |
| `src/e2e/features/speech-task-link.feature` | 测试 | 3 scenarios（口语深链闭环） |
| `src/e2e/step-definitions/speech-task.steps.ts` | 测试 | 口语任务联动步骤 |
| `src/e2e/support/pages/home.ts` | 修改 | `clickSpeakingTask` / `isSpeakingTaskCompleted` / `tapFirstNonSpeakingTask` / `openDashboard` / `completeAllTasks`（支持口语深链）/ `taskCount`（计数修正） |
| `src/e2e/support/pages/speech.ts` | 修改 | `completeSession` 返回前等 `[data-component=TaskDoneNote]`（消除 completeTask 落库竞态） |
| `src/e2e/support/world.ts` | 修改 | 新增 `speakingTaskId`（跨 step 共享，修复 per-step 实例状态错乱） |
| `features/ai-308.md` | 设计 | 目标/契约/数据模型(无新实体)/验收/风险/测试计划 |
| `features/backlog.md` | 文档 | AI-308 → done |
| `.quality-gate.json` + 本报告 | 门禁 | 四道门证据 |

## 2. 一致性门（consistency）— PASSED

- `frontend tsc --noEmit`：**0 错误**
- `next build`：**通过**（复用 AI-307 构建，/speech 路由 + 全部 9 页面编译生成）
- `vitest`：**64/64 全绿**（AI-307 为 59，AI-308 新增 `tasks.spec.ts` 5 case）
- `e2e`：**19/19 全绿**（AI-307 为 16，AI-308 新增 `speech-task-link.feature` 3 scenarios）
- `e2e tsc`：**0 错误**
- **无新后端代码**：纯前端消费既有 `TasksModule`（`PATCH /tasks/:id/complete` + `GET /tasks/daily`）；既有 backend `jest` 436 tests 不退化

## 3. 测试门（tests）— PASSED

### 单元测试（frontend vitest，新增 tasks.spec.ts 5 case 全绿）
- **`isSpeakingTask`**：`icon==='mic'`→true；`headphones`/`pencil`→false；空串 `''`→false；`undefined`→false
- **`speakingTaskHref`**：返回 `'/speech?taskId=' + encodeURIComponent(id)`，query 正确编码

### 回归（既有 suite 不退化）
- `speech.spec` 13 + `speech-recorder.spec` 17 + `api.spec` 11 + `plan.spec` 14 + `logger.spec` 4

### BDD / E2E — speech-task-link.feature 3 scenarios 全绿
1. **Home 点 mic 任务 → 进入 /speech?taskId**：口语深链导航 + URL 携带 taskId
2. **完成会话 → Home 该任务勾选 + 完成计数 1/3**：完整闭环（听→录→评→反馈→得星 → completeTask 回写 → Home 反映 completed）
3. **非口语任务仍一键完成**：headphones/pencil 任务保持原一键完成路径

### E2E headless harness 修复（消除假阴性）
- **落库竞态**：`completeSession()` 在 `finished` 后立即点"返回 Home"，早于 `completeTask` 异步 POST 落库 → Home `getDailyTasks` 重拉时任务未勾选。修复：返回前等 `[data-component=TaskDoneNote]`（completeTask resolve 的可视信号，10s 超时对无 taskId 会话 no-op）。
- **taskId 提取**：Next.js `<Link>` 的 `href` 经 Playwright `getAttribute` 返回 `null`（已知行为），改从导航后 `page.url()` 提取 taskId（与产品读取同源）。
- **跨 step 状态**：`clickSpeakingTask` 原将 `speakingTaskId` 存于 per-step 新建的 `HomePage` 实例，断言 step 又新建实例读到 `null` → 恒 false。修复：存于共享 `E2EWorld.speakingTaskId`。

## 4. 评审门（review）— PASSED

- **Home 口语深链**：未完成的 mic 任务渲染为 `<Link href="/speech?taskId=..." data-speech-link data-task-id>`；其余任务维持一键完成 `<button>`；所有卡片带 `data-task-id` 供 E2E 精确定位。完成后 mic 任务翻转为 `<button aria-pressed>`，UX 一致。
- **speech 页读 taskId**：`useSearchParams` 需在 `<Suspense>` 内（Next 静态生成要求）→ 已包裹；`finished` 时 fire-and-forget `completeTask`，`taskMarked` 守卫保证幂等只调一次。
- **写回信号对齐用户行为**：`TaskDoneNote`（"Daily task complete!"）仅在 `completeTask` resolve 后出现，恰对应真实孩子"看到完成提示再回首页"的节奏，避免提前导航丢写。
- **后端防腐**：`completeTask` 幂等（重复完成无害），写 `task_completions`（Home `completed` 派生源）并对计划任务回写 `study_plan_days.isDone`；无新实体/端点/依赖。
- **不越界**：纯前端消费既有 `TasksModule`；不接新鉴权/存储；`AuthGate` 包裹 + 客户端导航保活 token（规避 `page.goto` 重置）。
- **空安全**：`completeTask` 失败仅 `logger.error` 不阻断；`taskId` 缺失时 effect 早退，页面降级为无联动但不崩溃。

## 5. 优化门（optimization）— PASSED

- 纯逻辑 `tasks.ts`（`isSpeakingTask` / `speakingTaskHref`）node 直覆，零 React 依赖，无网络/渲染副作用
- 无 stub/占位（深链是真功能，非 TODO）
- 清理调试残留：移除 `rawSpeakingHref` / `getCapturedSpeakingTaskId` / `getRawSpeakingHref`
- Home/Speech 改动最小化；`completeAllTasks` 增强支持口语深链任务（`plan-progress` 场景 future-proof），不破坏既有一键完成路径
- 无裸 `console`（统一 `logger`）

## 6. 关键设计决策与边界

- **口语深链契约**：`speakingTaskHref(taskId) = '/speech?taskId=' + encodeURIComponent(taskId)`；speech 页 `useSearchParams().get('taskId')` 读取。`taskId` 即 `DailyTask.id`，与后端 `PATCH /tasks/:id/complete` 对齐。
- **完成回写幂等**：`completeTask` 后端对 `(userId, taskId, date)` 唯一约束去重；前端 `taskMarked` 守卫避免 StrictMode/重渲染重复调用。
- **会话星星仍本地**：AI-307 的会话星星数为 `useState` 不落库；本 feature 仅负责"每日任务勾选"，星星累计/课程联动属后续（AI-208 等），不在本范围。
- **后端复用，不新增**：M3 链（AI-302 录 / AI-303 评 / AI-306 反馈）已落地；AI-308 只做"任务入口 + 完成回写"黏合层，零后端改动。
- **E2E 状态隔离**：本会话反复跑 E2E 曾因共享 `dev.sqlite` 累积已完成任务/生成计划导致假阳性（7 failed）；清库 `rm dev.sqlite && npm run seed` + 重启后端后 19/19 稳定全绿。CI 每次 fresh seed 不受影响。

## 7. 下一步（M3 收尾）

- **AI-309** 句子跟读库（供句子模式；AI-303 当前 `sentenceId→400` 待其落地）
- 口语链（AI-302~AI-308）整条已本地落地（feat/ai-209 → … → feat/ai-308），待 push
