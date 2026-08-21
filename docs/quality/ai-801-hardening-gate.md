# 质量门报告 — ai-801-hardening

> AI-801 课程生成链路加固 + 配套体验修复。生产代码改动集中在 `server/src/ai`、`server/src/plan`、`src/lib/api.ts`、`src/app/[locale]/plan|practice`。

## 改动清单

1. **AI 调用可靠性（AI-801 收尾）**
   - `retryable-ai-provider.ts`：单次调用超时环境变量化 `AI_COURSE_TIMEOUT_MS`（默认 18s，×最多 3 次 < Vercel 60s 上限）；maxTokens 提升至 12000，治理课程 JSON 被截断导致的连续校验失败降级。
   - `server/.env.example` / README 同步文档。
2. **generate-courses 幂等**
   - `plan.service.ts`：同一计划重复生成直接返回已有课程（`model:idempotent`，实测 85s → 116ms、零 AI 调用）。判据 = 计划天引用（`lessonRefsJson`，缺失回退解析 `content`）指向的课程真实存在且标题与 `deriveCourseSpec(plan).title` 一致；引用课程被删（findOne NotFound）视为未生成、回退重新生成。
   - 新增私有方法 `findExistingGeneratedCourse`；spec 补 mock `findOne` + 3 个新用例（幂等直返 / 种子课程不误判 / 删课后回退重生成）。
3. **前端计划页卡死修复**：生成/应用异常路径复位 loading 态。
4. **API 401 统一处理**：`api.ts` 新增 `handleSessionExpired()`——清本地会话并按 locale 跳转 `/{locale}/login`；覆盖 `request` / `postFormData` / `generatePlanStream` 三个出口；登录接口豁免（凭据错误不清会话）、已在登录页防循环；新增 `api-401.spec.ts` 5 用例。
5. **练习页返回键**：跟课模式（URL 带 `courseId`）新增「返回课程」按钮；tab 自由练习不显示（tab 根页面靠底部导航切换）。提前退出不调 `completeLesson`，不计完成不加星。

## 验证证据

- 后端：`tsc --noEmit` 0 错误；jest **933/933 全绿（100 suites，Node 22 运行时）**。
- 前端：`tsc --noEmit` 0 错误；vitest **160/160 全绿（17 files）**，含 i18n zh/en parity 断言。
- 实测幂等：同一计划二次调用 `POST /api/ai/plan/:id/generate-courses` 返回 116ms、同一 courseId、app 日志无新 AI-CALL 条目。
- E2E 未本地运行 → `user-accepted-ci`，交 CI e2e job 兜底。

## 环境注意（非代码回归）

better-sqlite3 按 Node 22 ABI（NODE_MODULE_VERSION 127）编译。涉及真实 SQLite 连接的测试套件（entity synchronize / seed bootstrap / module DI 共 6 suites）必须在 Node 22 下运行；系统 Node 24（ABI 137）会报 `NODE_MODULE_VERSION` 不匹配并超时失败。本地复现命令：

```powershell
$env:PATH = "D:\Users\BIAOWU1\.workbuddy\binaries\node\versions\22.22.2;" + $env:PATH; npm test
```

## 四道门

| 门 | 结果 |
|----|------|
| consistency | 前后端 `tsc --noEmit` 均 0；i18n zh/en key parity 通过 |
| tests | 后端 jest 933/933（100 suites）；前端 vitest 160/160（17 files）；user-accepted-ci：E2E 交 CI e2e job 兜底 |
| review | 0 open；幂等判据双守卫（种子课程标题不同不误判、课程被删可重建）；401 仅对携带 token 的请求触发 |
| optimization | 0 open；幂等检查 = O(计划天数) 引用解析 + 至多一次 findOne，命中路径零 AI 调用；零新增依赖 |
