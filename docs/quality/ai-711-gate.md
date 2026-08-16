# AI-711 质量门报告

> 分支: `feat/ai-711` | 栈: node-ts (NestJS 10 + Next.js 14 + better-sqlite3) | 提交方式: 仅 commit（不 push）
> 对应设计文档: `features/ai-711.md`
> 日期: 2026-08-13
> 门禁结论: **4 门全部 PASSED，cleared=true**

## 背景

AI-711 在 AI-705（家长级默认 provider）+ AI-710（家庭绑定）之上，支持**每个孩子单独指定 provider**：家长在「我的孩子」列表每行给孩子选一个自己名下的 provider 配置，或留空「沿用家长默认」。孩子发 AI 请求时按 role 分流（child → `resolveForChild`，parent → `resolveDefault`），多层安全降级（child 覆盖 → 家长默认 → env 默认）。是 M8 家庭账户里程碑的可选增强。

## 改动清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `server/src/entities/user.entity.ts` | 改 | `User` 新增可空列 `childProviderConfigId`（uuid，引用 provider_configs.id，不建物理外键） |
| `server/src/ai/provider-config/provider-config.service.ts` | 改 | 新增 `resolveForChild(childUserId)`：查 child 覆盖 → 命中且归属家长返回；否则回退 `resolveDefault(parentId)`；孤儿/异常 → null |
| `server/src/ai/provider-config/provider-config.service.spec.ts` | 改 | 新增 6 个 `resolveForChild` 测试（命中/悬空回退/无覆盖/孤儿/null userId） |
| `server/src/ai/ai-provider.router.ts` | 改 | `resolve()` 重写为按 role 分流（child→resolveForChild；parent→resolveDefault；异常/无→env 默认） |
| `server/src/ai/ai-provider.router.spec.ts` | 改 | 重写为 7 个测试，按 role 分流（child 覆盖/回退家长默认/null→env；parent 命中/异常回退） |
| `server/src/parent/parent.service.ts` | 改 | 新增 `setChildProvider`（404/403 校验）、`getChildProviderOptions`、`toProviderOptionView`/`parseModels`/`parseCapabilities`；`toChildView` 含 `hasProviderOverride` + `providerConfigId`；`ChildView` 接口补 `providerConfigId` |
| `server/src/parent/parent.service.spec.ts` | 改 | 新增 ProviderConfig mock repo + 10 个 AI-711 测试（setChildProvider 5、getChildProviderOptions 3、ChildView shape 1） |
| `server/src/parent/parent.controller.ts` | 改 | 新增 `PUT /parent/children/:childId/provider`、`GET /parent/children/:childId/provider-options`（均挂 ParentGuard） |
| `server/src/parent/parent.controller.spec.ts` | 改 | 新增 2 个转发测试（setChildProvider / getChildProviderOptions） |
| `server/src/parent/parent.module.ts` | 改 | `forFeature([User])` → `forFeature([User, ProviderConfig])` |
| `server/src/parent/dto/set-child-provider.dto.ts` | 新 | `SetChildProviderDto { providerConfigId?: string \| null }` |
| `src/lib/types.ts` | 改 | `ChildView` 加 `providerConfigId: string \| null`；新增 `SetChildProviderDto` |
| `src/lib/api.ts` | 改 | 新增 `setChildProvider(childId, dto)`、`getChildProviderOptions(childId)` |
| `src/app/[locale]/parent/page.tsx` | 改 | `ChildrenSection` 每行增加 provider 下拉（「沿用家长默认」+ 家长各配置）+ override/default 徽标，分配后同步刷新徽标 |
| `src/messages/zh.json` / `en.json` | 改 | Parent 命名空间新增 childProvider 相关 6 个键 |
| `src/e2e/support/pages/parent.ts` | 改 | 新增 child provider select 页面对象（waitFor/select/expect） |
| `src/e2e/support/world.ts` | 改 | 新增 `providerConfigs` / `assignStatus` 字段 |
| `src/e2e/step-definitions/per-child-provider.steps.ts` | 新 | 3 场景步骤（分配显示 override / 回退默认 / 越权 403） |
| `src/e2e/features/per-child-provider.feature` | 新 | 3 个 BDD 场景 |
| `src/e2e/cucumber.per-child-provider.js` | 新 | cucumber 配置 |

## 验证结果

| 检查 | 命令 | 结果 |
|---|---|---|
| 后端类型 | `tsc -p tsconfig.json --noEmit` (server/) | ✅ 0 错误（并 `nest build` 产出 dist 通过） |
| 前端类型 | `tsc -p tsconfig.json --noEmit` (src/) | ✅ 0 错误 |
| E2E 类型 | `tsc -p e2e/tsconfig.json --noEmit` | ✅ 0 错误 |
| 后端单测 | `jest` (server/) | ✅ 859/859 通过（含 AI-711 跨 4 个 spec 共 25 新用例） |
| 前端单测 | `vitest run` (src/) | ✅ 127/127 通过（含 i18n 新键对齐） |
| HTTP 冒烟 | `node smoke-test.mjs`（真实后端 + 临时 SQLite + AI_PROVIDER=mock） | ✅ 21/21 断言通过（见下） |

### HTTP 冒烟测试覆盖（真实 HTTP 栈，替代受限的 Playwright UI E2E）

1. `POST /api/auth/register` 家长 → 201，拿到 accessToken。
2. `POST /api/provider-config` ×2（家长名下两个配置）→ 均 201。
3. `POST /api/parent/children` 创建孩子 → 201。
4. `PUT /api/parent/children/:childId/provider {providerConfigId: cfg1}` → **200**，`providerConfigId` 回写为 cfg1，`hasProviderOverride=true`。
5. `GET /api/parent/children/:childId/provider-options` → **200**，返回 2 个配置；**不泄露明文 apiKey**（仅 `masked`）；字段形状与 `ProviderConfigView` 一致。
6. `PUT /api/parent/children/:childId/provider {providerConfigId: 随机uuid}` → **403**（越权拦截，禁止把孩子指到他人配置）。
7. `PUT /api/parent/children/:childId/provider {providerConfigId: null}` → **200**，`providerConfigId=null`，`hasProviderOverride=false`（回退家长默认）。

## 四门结论

### 1. 一致性门（consistency）— PASSED

- 后端 `tsc --noEmit`：0 错误；`nest build` 产出 `dist/main.js` 成功（**构建期捕获一处真实缺陷**：后端 `ChildView` 接口漏声明 `providerConfigId`，`toChildView` 赋值触发 TS2353；ts-jest 的 `isolatedModules` 不严格检查对象字面量故单测未暴露，已补接口字段修复）。
- 前端 `tsc --noEmit`：0 错误（`parent/page.tsx` ChildrenSection 下拉 + 徽标 + `lib/types.ts` + `lib/api.ts`）。
- E2E `tsc --noEmit`：0 错误（`parent.ts` 新方法 + `per-child-provider.steps.ts`）。
- 全栈契约对齐：前端 `ChildView` 与后端 `ChildView` 字段一致（id/nickname/username/role/level/totalStars/streakDays/hasProviderOverride/**providerConfigId**/createdAt）；`SetChildProviderDto` 前后端字段一致（`providerConfigId?: string | null`）。

### 2. 测试门（tests）— PASSED

**后端单元测试（jest，AI-711 跨 4 个 spec 共 25 新用例全绿）**：

- `provider-config.service.spec.ts`（+6）：`resolveForChild` 命中 child 覆盖返回该配置；配置已删/悬空 → 回退家长默认；无覆盖 → 回退默认；孤儿 child → null；userId 为 null → null。
- `ai-provider.router.spec.ts`（7，重写）：child 有覆盖 → 走覆盖 provider；覆盖无效 → 回退家长默认 → 回退 env；parent 命中 → 走默认；parent 异常 → 回退 env。
- `parent.service.spec.ts`（+10）：`setChildProvider` 命中 owner config → 写回；config 不归属家长 → 403；child 不存在/不归属 → 404；null 清除覆盖；`getChildProviderOptions` 返回掩码列表/child 不归属 → 404；`ChildView` 含 `providerConfigId` 与 `hasProviderOverride`。
- `parent.controller.spec.ts`（+2）：两新端点正确转发 `parentId` + dto 给 service。

**前端单元测试（vitest，127/127 全绿）**：

- `lib/i18n-messages.spec.ts`（2/2）：zh/en 键对齐+命中，覆盖 AI-711 新增 Parent 命名空间键。
- 其余 125 个预存测试无回归。

**BDD/E2E（3 scenario 已编写，待 CI 实跑）**：

1. 家长配 2 个 provider → 给孩子分配 A → 列表该行显示「独立配置」徽标。
2. 改回「沿用家长默认」→ 徽标切换为「沿用默认」。
3. 家长尝试把孩子指到非本人 provider → 后端 403。

> UI E2E 需 `next build` + `next start` 生产模式 + 后端 `AI_PROVIDER=mock` 双服务起服 + Playwright 浏览器（沙箱缺失，CI 环境实跑）。feature/步骤/页面对象已就绪并通过 `tsc`。**本次以真实 HTTP 冒烟测试（21 断言全绿）补足运行时验证，覆盖 HTTP 层路由注册、ParentGuard 鉴权、归属 403、掩码序列化等关键路径。**

### 3. 代码审查门（review）— PASSED（0 open）

- 越权校验：`setChildProvider` 校验 `child.parentId === parentId`（404）+ `config.ownerUserId === parentId`（403，禁止把孩子指到他人配置）；`parentId` 一律取 JWT `req.user.userId`。
- 空安全：`providerConfigId ?? null`；`resolveForChild` 配置不存在/孤儿/userId 为 null 均安全回退，不抛启动错误。
- 多层降级：`resolveForChild`（child→家长默认）与 `AiProviderRouter.resolve()`（家长默认→env 默认）每层异常独立捕获。
- 密钥不泄露：`getChildProviderOptions` 经 `toProviderOptionView` 仅返回 `masked`，不明文 apiKey。
- 循环依赖规避：`ParentModule` 直接 `forFeature([User, ProviderConfig])` 注入仓库 + 复用 crypto 工具，不跨模块注入 `ProviderConfigService`（避免与已 import ParentModule 的 ProviderConfigModule 形成环）。
- 实体注册：仅加一列（`childProviderConfigId`），非新实体，零 appEntities 改动，TypeORM `synchronize` 自动同步。

### 4. 优化门（optimization）— PASSED（0 open）

- 无 stub/占位代码；无临时调试输出（`smoke-test.mjs` 为验证脚本，未纳入提交）。
- 零新增依赖。
- 前端 `ChildrenSection` 移除未用 `providerBusy` state，仅用 `busy`；分配成功后同步 `setChildren` 使徽标立即反映新值（修复 stale state 不刷新 bug）。
- E2E 页面对象复用既有 Select 原语（`aria-expanded` trigger + `data-component="SelectOption"` 选项），无重复实现。

## 遗留风险 / 说明

- BDD/E2E 3 个 scenario 已编写并通过 `tsc`，但沙箱 `next build` 受限 + Playwright 浏览器未安装，需 CI 真实环境实跑；本次以真实 HTTP 冒烟测试补足运行时验证。
- `resolveForChild` 的「删除 provider 后悬空回退」路径由单测覆盖；若未来 provider 删除逻辑新增级联，需同步回归。
- 当前分支 `feat/ai-711` 未 push，由用户决定 merge/push。
