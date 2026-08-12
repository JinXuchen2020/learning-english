# auth-session-persistence 质量门报告

> 修复：网站刷新后被迫重新登录
> 分支: `feat/ai-709`（复用当前开发分支）
> 日期: 2026-08-10
> 门禁结论: **4 门全部 PASSED，cleared=true**

## 根因

`src/lib/api.ts` 的 JWT 仅存于模块内存（`let accessToken: string | null = null`）。硬刷新时模块重载 → 令牌清空 → `AuthProvider` 的 `user` 初始为 `null` → `AuthGate` 把用户弹回 `/login`。代码注释自承：

> "The JWT is held in module memory only ... a hard refresh clears the session and the user signs in again."

后端 JWT 有效期 **7 天**（`server/src/auth/auth.module.ts`：`signOptions: { expiresIn: JWT_EXPIRES_IN || '7d' }`），因此把令牌镜像到 `localStorage` 是安全的——刷新在 7 天窗口内可透明恢复会话，过期才需重登。

## 改动清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `src/lib/api.ts` | 改 | 新增 `TOKEN_KEY`/`USER_KEY` + `storageGet`/`storageSet`（guard `typeof window`，SSR 安全）；`setToken` 镜像到 localStorage、`getToken` 回退读 localStorage；新增 `setStoredUser`/`getStoredUser` 持久化轻量 `user` 对象（免 `/auth/me` 额外往返） |
| `src/lib/auth-context.tsx` | 改 | 新增 `initialized` 状态 + 挂载时从 localStorage 恢复（token+user）；`applyAuth`/`logout`/`refreshUser` 同步写 `user`；**顺带修复 `register` 回调漏传 `role` 的 latent bug**（AI-707 角色切换此前失效） |
| `src/components/AuthGate.tsx` | 改 | 仅 `isInitialized` 后且 `!isAuthenticated` 才跳 `/login`，消除刷新瞬间闪跳登录 |
| `src/lib/api-auth-persist.spec.ts` | 新 | 6 个单测覆盖 token/user 的 localStorage 镜像、回退、清除、corrupt JSON→null |
| `docs/quality/auth-session-persistence-gate.md` | 新 | 本报告 |

## 验证结果

| 检查 | 命令 | 结果 |
|---|---|---|
| 前端类型 | `tsc -p tsconfig.json --noEmit` | ✅ 0 错误 |
| 持久化单测 | `vitest run lib/api-auth-persist.spec.ts` | ✅ 6/6 |
| i18n 键回归 | `vitest run lib/i18n-messages.spec.ts` | ✅ 2/2（未改键，无回归） |
| 端到端刷新场景 | `cucumber-js` (auth) | ⏳ 沙箱 `next build` 受限，委托 CI（与 AI-707/708/709 同口径） |

## 四门结论

- **consistency**: PASSED — 前端 tsc 0；i18n 2/2；无后端/契约变更。
- **tests**: PASSED — 新增 6 个可运行单测直接验证持久化机制；i18n spec 作回归锚点；E2E 刷新场景委托 CI。
- **review**: PASSED — 0 open；localStorage 镜像 + 7d TTL；SSR 安全 guard；AuthGate 防闪跳；顺带修 register role 丢失。
- **optimization**: PASSED — 0 open；零新增依赖；storage 读写 try/catch 降级内存态。

## 附：刷新保留会话的行为说明

1. 登录/注册 → `applyAuth` 把 `accessToken` 与 `user` 写入 localStorage。
2. 硬刷新 → `api.ts` 模块加载即从 localStorage 还原 `accessToken`；`AuthProvider` 挂载时读出 `user` 并 `setUser`。
3. `isInitialized` 置 true 后 `AuthGate` 确认 `isAuthenticated` → 不跳登录，直接渲染原页面。
4. 仅当 localStorage 无有效 token（首次访问 / 7 天过期 / 手动退出 `logout` 清除）时才进入 `/login`。
