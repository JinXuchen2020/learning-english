# 质量门禁报告 — AI-408 对话星标与鼓励

> 日期: 2026-08-07
> 分支: `feat/ai-408`（基于 `feat/ai-407`）
> 关联设计: `features/ai-408.md`、backlog AI-408 `done`

## 四门结果（扁平 `.quality-gate.json`，全部 PASSED）

| 门 | 结果 | 证据 |
|---|---|---|
| consistency | PASSED | frontend `tsc --noEmit` 0 错误；`next build` 通过（`/chat` + `/` 编译 200）；`vitest 80/80`；backend `nest build` 通过；`jest` 聊天 92/92；无 schema 变更（复用 AI-401 `ai_chat_sessions.stars` 列，默认 0）；无新依赖 |
| tests | PASSED | unit：vitest 80/80 + jest 92/92；e2e：chat.feature 7 scenarios + home-dashboard.feature 1 scenario 全绿；全部路由 `page.route` 打桩，不依赖真实 LLM/配额 |
| review | PASSED | 星标计算抽离纯函数 `chat-stars.ts`（单一数据源）；`stars>prevStars` 防双发星；data-component 钩子齐全；Home 聊天星与练习星独立；无裸 console |
| optimization | PASSED | 纯函数零副作用；`getChatStars` 一次聚合查询；庆祝 4s 自动消失；加载解耦失败不阻塞；阈值常量单一可调 |

## 测试明细

### 后端单元（Jest，server）
- `chat-stars.spec.ts` — 11 case：`computeStars` 边界（0/7→0 星、8/9→1 星、15→1 星、16→2 星、负/浮点安全、余数→`starsUntilNext`、默认阈值 8、`prevStars` 已领先不再发星）。
- `chat.service.spec.ts` — 7 case：`sendMessage` 8 轮得星 / 7 轮不得星 / 从 1 星续聊 16 轮得第 2 星 / `messageRepo.count` 异常安全回退 / `getStars` 聚合 / 默认 anonymous / 无会话→0。
- `chat.controller.spec.ts` — 2 case：`GET /stars` 透传 `userId` / 缺省透传 `undefined`。

### 前端单元（Vitest，src）
- `lib/api.spec.ts` — +2 case：`getChatStars` 带 `userId` 查询串 / 缺省无查询串。

### 端到端（Cucumber + Playwright）
- `features/chat.feature` 新增「完成 8 轮得星庆祝」：`mockChatReply(..., {awardOnRound:8})` 第 8 次回复 `starAwarded` → 断言 `ChatStarCelebration` 可见 + `ChatStarCount` 文本 `1`。
- `features/home-dashboard.feature` 新增「聊天星星卡」：`mockChatStars(3)`（置于登录前）→ 断言 `ChatStars` 含 `3`。
- 全部后端路由 `page.route` 打桩（scenes / messages / stars / safety-fallback / evaluate），不依赖真实 LLM 与 AI 配额，稳定无 flake。

## 关键实现点
- 星标阈值 `CHAT_STAR_ROUNDS = 8` 为单一常量；`computeStars(rounds, prevStars)` 纯函数，`starAwarded = stars > prevStars` 避免续聊/重复 send 双发星。
- `ChatService.sendMessage` 在 TTS 合成后用 `messageRepo.count({where:{sessionId, role:'user'}})` 得本会话轮数，跨阈值则落库 `ai_chat_sessions.stars`。
- `getStars(userId?)` 用 `COALESCE(SUM(stars),0)` 聚合该用户所有会话；Home 独立加载，失败不影响主数据。
- 前端：`/chat` 头部 `ChatStarCount` 徽标 + `ChatStarCelebration` 庆祝横幅（4s 自动消失）；Home 问候横幅 `ChatStars` 卡（仅 `chatStars>0`）。

## 提交
四门 + pre-commit hook 放行，提交不 push。文档同步：backlog(AI-408 mark done) + `docs/ai-integration.md` 前端 /chat 段 + 后端 stars 端点 + Home 展示 + 本报告。
