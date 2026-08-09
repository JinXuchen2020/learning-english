# AI-702 质量门报告 — 家长模式骨架（PIN 锁 + 控制面板）

> 生成时间：2026-08-09 · 分支：feat/ai-702（自 feat/ai-701 派生）· 仅 commit 不 push
> 四质量门：consistency / tests / review / optimization —— 全部 PASSED

## 1. 交付内容

- **后端 `ParentModule`（`server/src/parent/`）**：
  - `parent.service.ts`：`verifyPin` / `setPin`（首次设置）/ `changePin`（旧 PIN 校验）/ `hasPin` / `signParentToken`（签发 `role:'parent'` 的 15 分钟 JWT）。PIN 经 **bcrypt** 哈希存于 `User.parentPinHash`（非明文）。
  - `parent.controller.ts`：`GET /parent/status`（child JWT）、`POST /parent/verify-pin`、`POST /parent/setup-pin`（首次，已设则 409）、`POST /parent/change-pin`（**ParentGuard**）。
  - `parent.guard.ts`：**新家长门禁**——校验 `Authorization: Bearer <家长JWT>` 且 `payload.role==='parent'`；取代 AI-701 的 `rewards/parent.guard.ts` 明文 `x-parent-approval` token 方案，已删除旧文件。
  - `parent.module.ts`：`exports: [ParentGuard, JwtModule]`（让导入它的 `RewardsModule` 控制器能在自身上下文解析 `JwtService`）。
- **接线**：`RewardsModule` 导入 `ParentModule` 并改用新 `ParentGuard`（审批/奖励目录 CRUD 端点改由家长 JWT 保护）；`app.module.ts` 注册 `ParentModule`；`User` 实体新增 `parentPinHash` 列（显式 `type`，避开 better-sqlite3 联合类型陷阱）。
- **前端**：`src/lib/api.ts` 移除静态 `PARENT_APPROVAL_TOKEN` / `parentApprovalHeaders`，新增 `parentToken` 模块内存管理 + `request` token 覆盖参数 + `getParentStatus/verifyParentPin/setupParentPin/changeParentPin`，审批类请求改用家长 token；新建 `/parent` 控制面板（`ParentPinGate` → `ParentApprovals` + `PinManage` + `ExitParentBtn` + `ReportPlaceholder`（M5 预留））；`TabNav` 加「家长」入口；`/rewards` 改为纯儿童商城（移除审批区）。
- **测试**：`parent.service.spec.ts`（15 项：verifyPin 命中/未命中/无 PIN、setPin 哈希非明文、changePin 旧 PIN 错误抛错/正确更新、signParentToken role）、`parent.guard.spec.ts`（无头/非 Bearer/child token/过期篡改→拒，父 token→放行并设 req.user）；E2E `parent.feature`（首次设 PIN→审批兑换；退出后错误 PIN 被拒不进面板）。

## 2. 四质量门

### consistency — PASSED
- 后端 tsc 0 错；后端 jest 87 suites / 764 PASS（含 parent 两套 15 项 + ai.module 6 项因 JwtModule 导出修复复绿）；前端 vitest 11 files / 100 PASS；next build 0 错（含 `/parent` 路由）。
- 契约对齐：前端 `RewardRedemption`/`RedemptionStatus` 与后端一致；审批接口从 `x-parent-approval` 头切换为 `Authorization: Bearer <家长JWT>`，前后端同步（api.ts 与 ParentGuard 均已更新，无残留明文 token 引用）。

### tests — PASSED
- 单元：ParentService 覆盖 PIN 哈希存储（断言哈希 ≠ 明文且 `bcrypt.compare` 通过）、verify/setup/change 全分支；ParentGuard 覆盖 5 种令牌场景（含 child token 与篡改令牌拒绝）。**新增 `rewards.service.spec` 回归项**：验证「首次获得积分前 `user_points` 行尚未建立时 `awardStars` 兜底建行、积分仍可入账」。
- E2E（BDD）：`parent.feature` 2 scenarios / 25 steps 全绿（PIN 锁挡儿童 + 审批闭环，含故意错误 PIN 被拒）；`rewards.feature` 改写后 2 scenarios / 12 steps 全绿（儿童攒分→兑换 pending、余额≥1 + 等级环）。异步断言全部用 `waitForFunction`（禁止 `locator.count()` 即时计数）。
- 后端相关模块单测合计 53 PASS（parent 两套 22 + rewards 20 + tasks 11）。

### review — PASSED
- 越权防护：审批/奖励目录 CRUD 端点须家长 JWT（`role:'parent'`），child JWT 无法调用（ParentGuard 显式校验 role）；`/parent` 面板未持家长 token 时仅显示 PIN 门禁，儿童默认无审批权限。
- 数据安全：PIN 仅存 bcrypt 哈希，不落明文；`verifyPin` 无 PIN/错误均返回布尔不泄露状态；`changePin` 强制旧 PIN 校验。
- 已知限制（demo 级，已注明）：4 位 PIN 仅 10⁴ 组合，bcrypt 哈希仅满足「不落明文」基线，未引入限流/锁定（超范围）。
- 无敏感日志；错误文案友好（PIN 错误 / 旧 PIN 不正确）。

### optimization — PASSED
- 复用既有 `bcrypt` 与 `JwtService`，零新依赖；`ParentModule` 为聚焦叶子（仅 `User` 仓库 + `JwtModule`），最小化 DI。
- 家长 token 模块内存管理（与 child token 同口径），刷新即清——对儿童产品是正向安全摩擦，无 localStorage 持久化泄露风险。
- 无 stub/临时调试；AI-701 临时门禁代码已彻底移除（删 `rewards/parent.guard.ts`、移除前端 `PARENT_APPROVAL_TOKEN`）。

## 3. 关键修复记录（经验）

1. **`ai.module.spec.ts` DI 失败（ParentGuard 注入 JwtService）**：`RewardsModule` 导入 `ParentModule` 后，其控制器使用的 `ParentGuard`（依赖 `JwtService`）在 `RewardsModule` 上下文解析失败（`Nest can't resolve dependencies of the ParentGuard ... JwtService ... in the RewardsModule context`）。修复：`ParentModule` `exports` 加 `JwtModule`，使导入方透传获得 `JwtService`。同类陷阱（新实体/服务进 TestingModule 须补仓库 override）已写入 `MEMORY.md`。
2. **`appEntities` 不需改**：`User` 实体已在 `database.config.ts` 的 `appEntities` 注册（AI-701 教训），本次仅需 `forFeature([User])` 注入仓库。
3. **前端 `request` token 参数**：审批调用原误把 `auth`/`token` 写进 `options` 对象（TS 报 `auth` 不在 `RequestInit`），已改为独立位置参数 `request(path, options, auth, token)`。
4. **`rewards.service.ts` `awardStars` 积分永不入账（AI-701 真实缺陷，被 AI-702 QA 暴露）**：`awardStars` 直接 `pointsRepo.increment({userId},'balance',n)`，但 `user_points` 行由 `getBalance→getOrCreatePoints` **懒建**。若 `awardStars` 先于该行建立执行（生产常态：完成任务时 Home 的 `getProgress` 与本次完成并发竞争），`increment` 命中 0 行而**静默无效**——`totalStars` 累加但 `pointsBalance` 恒为 0，儿童永远无法攒到可消费积分（整个 AI-701 奖励商城事实报废）。修复：`awardStars` 开头先 `await getOrCreatePoints(userId)` 兜底建行再 increment；单测加回归项锁行为。curl 复现：不预建行时 `pointsBalance` 恒 0，修复后变 1。
5. **rewards E2E 竞态（领取积分断言读到 0）**：`completeFirstTask` 原仅等乐观 UI 翻 `aria-pressed`（点击即翻，后端 `completeTask` 仍在途），随即 `/rewards` 挂载时 `getProgress` 抢跑读到 0 且不再重拉 → 断言超时。修复：`home.ts completeFirstTask` 在乐观翻转后**再等 `RewardsHomeCard` 的 `progress.pointsBalance≥1`**（该卡由 `setProgress` 在 API 落库后回写），确认服务侧已入账再跳转。rewards E2E 由稳定失败→稳定 12/12 通过。

## 4. 验证命令（复跑）

```
# 后端
cd server && node ./node_modules/typescript/lib/tsc.js -p tsconfig.json --incremental false
cd server && node ./node_modules/jest/bin/jest.js
# 前端
cd src && node ./node_modules/typescript/lib/tsc.js -p tsconfig.json --noEmit
cd src && node ./node_modules/vitest/vitest.mjs run
cd src && node ./node_modules/next/dist/bin/next build
# E2E（起服 Node20 AI_PROVIDER=mock + npm run seed，build 后 next start）
node ./node_modules/@cucumber/cucumber/bin/cucumber.js --config e2e/cucumber.parent.js
node ./node_modules/@cucumber/cucumber/bin/cucumber.js --config e2e/cucumber.rewards.js
```
