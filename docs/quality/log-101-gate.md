# LOG-101 质量报告

> Phase: log-101 | Stack: node-ts (Next.js 14 + NestJS 10 + TypeORM) | Branch: feat/log-101-logger
> Quality-Gate: consistency + tests + review + optimization **PASSED** (cleared: true, enforced: true)

## 做了什么

统一日志基建：移除应用生产代码中的裸 `console.*`，全部接入 Logger。

- **后端** `server/src/common/logger/logger.ts`：`createLogger` 单例，按级别（`error/warn/info/debug`）写 `server/logs/app-YYYY-MM-DD.log`（异步 append，best-effort，写失败不崩应用），同时镜像到对应 `console` 方法。导出纯函数 `serializeMeta`（Error/循环引用/数组/对象/原始值，安全 JSON 化）与 `formatLine`（稳定单行）。
- **后端** `server/src/logs/`：`LogsController`（`POST /api/log`）+ `LogEnvelopeDto`（class-validator 校验 `level` 枚举 / `message` 非空）+ `LogsModule`，在 `app.module.ts` 注册。前端日志经此接口写入**同一份**日志文件。
- **后端** `main.ts` / `seed.ts`：启动横幅与 seed 输出改 `logger.info/error`。
- **前端** `src/lib/logger.ts`：`logger` 封装 console 镜像 + best-effort `POST ${API_BASE}/log`（仅浏览器 + fetch 可用时转发；失败静默；绝不递归记录日志失败）。`src/lib/api.ts` 导出 `API_BASE`，并修复 `let body: any = null` → `unknown` + 收窄错误 `message` 类型。
- **前端页面** `src/app/page.tsx`、`src/app/practice/page.tsx`、`src/app/course/page.tsx` 的 7 处 `console.error` 全部改为 `logger.error`。

## 测试证据

| 层 | 框架 | 文件 | 结果 |
|---|---|---|---|
| 后端单元 | jest | `common/logger/logger.spec.ts` (serializeMeta / formatLine / 文件写入 / 级别过滤 / 写失败 best-effort) | 全绿 |
| 后端单元 | jest | `logs/logs.controller.spec.ts` (合法 envelope→write；DTO 校验非法 level/message→400) | 全绿 |
| 前端单元 | vitest | `lib/logger.spec.ts` (SSR 守卫 / 浏览器转发 / 转发失败静默 / console 镜像) | 全绿 |
| 前端单元 | vitest | `lib/api.spec.ts` (JSON 解析 / 错误 message / 非 JSON 回退) | 全绿 |

- 后端全量 jest：**91 tests / 22 suites 全绿**，覆盖率 statement/lines/functions = 100%、branches ≥ 70%（门槛 ≥90% s/l/f，≥70% b）。
- 前端 `next build` 通过（类型检查 + 编译）。
- 前端 `vitest run`：**7 tests / 2 files 全绿**。

### BDD/E2E 豁免说明

日志基建属跨切面基础设施，**无用户可感知的 UI 旅程**（前端 Logger 转发与后端落盘对用户透明，无页面交互），且项目 TEST-102 已确立「不为纯后端 API / 基础设施写 BDD」的红线。故 LOG-101 **不写 BDD/E2E**，以单测 + 集成（前端 `POST /api/log` 被后端同文件接收）为证据。后续带 UI 的新 feature 仍须各自自带 BDD/E2E。

## 一致性校验

- `nest build` 通过；`next build` 通过。
- 全栈契约对齐：前端转发 envelope `{ level, message, meta }` 与后端 `LogEnvelopeDto` 字段名 / 类型 / 可空一致（`level` 枚举、`message` 非空 string、`meta` 可选 unknown）。
- `main.ts` / `seed.ts` / 三个页面 生产代码裸 `console.*` 已清零（仅 `src/lib/logger.ts` 的 mirror 与 `src/e2e/**` 测试夹具保留，后者被质量门 `--exclude src/e2e` 豁免）。

## 质量门

1. **consistency** — PASSED：后端 build + jest 全绿 + 覆盖率门；前端 build + vitest 全绿；envelope 对齐。
2. **tests** — PASSED：后端 jest 2 文件 + 前端 vitest 2 文件；BDD/E2E 豁免（理由见上）。
3. **review** — PASSED（0 open）：裸 console 清零、`any` 清零、日志不泄露敏感、前端转发 best-effort 不递归。
4. **optimization** — PASSED（0 open）：无 stub/调试残留；日志异步不阻塞主流程。

## 文档同步

- `features/backlog.md`：置顶区 LOG-101 状态 `doing → done`。
- `.gitignore`：显式忽略 `server/logs/`（根 `logs/` 已覆盖）。
- CI：`.github/workflows/ci.yml` 新增 `frontend-unit` job（跑 vitest），四门禁扩展为五门。

## 遗留风险

- 本地 `server/logs/` 会按日生成日志文件（已被 `.gitignore` 忽略，不入库）。
- 前端单测 runner（vitest）为本次首次引入；后续前端纯逻辑模块应沿用 `src/lib/**/*.spec.ts` 约定。
- 当前分支未 push；merge/push 由用户决定。
