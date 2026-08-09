# AI-603 质量门报告 — 吉祥物成长剧情

- **Phase**: ai-603
- **Stack**: node-ts (NestJS 10 + TypeORM + better-sqlite3 / Next.js 14)
- **Branch**: feat/ai-603（从 feat/ai-602 派生；提交不 push，merge/push 由用户决定）
- **日期**: 2026-08-08
- **Gate 文件**: `.quality-gate.json`（扁平，`cleared:true`，`enforced:true`）

## 四道质量门结论

| 门 | 结论 | 关键证据 |
|----|------|----------|
| consistency | ✅ PASSED | 后端 `tsc -p tsconfig.json --incremental false` 全量类型检查 EXIT 0（0 错误）；前端 `next build` 类型检查 0 错误（12 路由编译成功）；全栈契约对齐（`MascotLevelInfo`/`MascotStory` 两端一致：`server/src/ai/mascot-level.util.ts` 与 `src/lib/mascotLevel.ts` + `src/lib/types.ts` 同口径 `computeLevel`/`LEVEL_THRESHOLDS`/`MAX_LEVEL`；`GET /ai/mascot/level` 与前端 `getMascotLevel()` 对齐，`GET /ai/mascot/story/:level` 与 `getMascotStory()` 对齐）；`User.level` 列显式 `type:'int'`；`MascotStory` 实体加入 `appEntities` + `TypeOrmModule.forFeature` |
| tests | ✅ PASSED | **unit**: 后端 `mascot-story.service.spec` 9 PASS（`getLevelInfo` 阈值推导/缺用户默认 L1/250 星推导 L4/999 星满级 + `getOrGenerateStory` 幂等不调 AI/首次 AI 生成/AI 抛错降级/非法 JSON 降级/level<1 钳到 1，mock repos + mock AiProvider）；前端 `src/lib/mascotLevel.spec` 4 PASS（`computeLevel` 阈值边界/满级/`MAX_LEVEL` 长度 + `buildLevelInfo` 进度）；**e2e/bdd**: `mascot-story.feature` 1 scenario / 5 steps 全绿（登录新用户→看到等级成长卡→吉祥物 `data-level=1`→点看成长故事→弹层标题+文案非空），成长卡 `data-component="MascotGrowthCard"` + 按钮 `ViewGrowthStoryBtn` + 弹层 `MascotStoryModal/Title/Text` 可断言；step 文本唯一无 ambiguous；普通 `<button>` 点击无 Next.js `<Link>` 卸载竞态 |
| review | ✅ PASSED | 0 open；`getOrGenerateStory` 幂等（已有直接返回）+ 唯一约束 race 回查；AI 失败/解析失败降级模板 `isDefault:true` 不抛 5xx；`computeLevel` 单一真相 + `completeLesson` 星星+1 后重算 `User.level`；`Mascot` 按 `level` 渲染配饰（围巾/披风/光环/皇冠）`data-level` 钩子；MockProvider 新增剧情关键词 + fixture 保证无 key 环境可演示；无裸 console |
| optimization | ✅ PASSED | 0 open；`computeLevel`/`buildLevelInfo` 纯函数前后端同口径单一真相；按需生成（前端调 `getOrGenerateStory`）避免 `completeLesson` 同步 AI 阻塞学习写入；无 stub；降级路径真实可用（MockProvider 返回合法 JSON 或解析失败走模板） |

## 本次新增/修改文件

**后端（新增/修改）**
- `server/src/ai/mascot-level.util.ts`（新）— `LEVEL_THRESHOLDS=[0,50,120,200,300,500]`/`MAX_LEVEL`/`computeLevel`/`buildLevelInfo`/`MascotLevelInfo`（前后端同口径纯函数）
- `server/src/ai/mascot-story.entity.ts`（新）— `MascotStory`（`@Entity('mascot_stories')`，`@Unique(['userId','level'])`，字段 `id`/`userId`/`level`/`title`/`storyText`/`isDefault`/`createdAt`）
- `server/src/ai/mascot-story-agent.ts`（新）— `MASCOT_STORY_SYSTEM_PROMPT`/`DEFAULT_STORY_*`/`MascotStoryAgentOutput`/`parseMascotStoryOutput`（鲁棒解析，兼容围栏/缺失字段→抛错交由降级）
- `server/src/ai/mascot-story.service.ts`（新）— `getLevelInfo`/`getOrGenerateStory`（幂等 + 失败降级 + 唯一约束 race 回查）
- `server/src/ai/mascot-story.controller.ts`（新）— `GET('level')` / `GET('story/:level')`
- `server/src/ai/mascot-story.service.spec.ts`（新）— 9 例单测
- `server/src/entities/user.entity.ts` — 新增 `level` 列（`@Column({ type:'int', default:1 })`）
- `server/src/progress/progress.service.ts` — `completeLesson` 星星+1 后重算并持久化 `level`
- `server/src/ai/mock-ai.provider.ts` — 新增 `STORY_KEYWORDS` + `MOCK_STORY_TEXT` fixture
- `server/src/ai/ai.module.ts` / `server/src/config/database.config.ts` — 注册 `MascotStory`

**前端（新增/修改）**
- `src/lib/mascotLevel.ts`（新）+ `src/lib/mascotLevel.spec.ts`（新）— 纯逻辑（与后端同口径）
- `src/lib/types.ts` — 新增 `MascotLevelInfo` / `MascotStory`
- `src/lib/api.ts` — 新增 `getMascotLevel()` / `getMascotStory()`
- `src/components/Mascot.tsx` — 新增 `level?: number` prop，按等级渲染配饰（L1 裸狐 / L2 叶子帽 / L3 围巾 / L4 披风 / L5 光环 / L6 皇冠），`svg` 加 `data-level`
- `src/app/page.tsx` — 等级环 + 等级成长卡 + 「看成长故事」按钮（普通 `<button>`，`data-component="ViewGrowthStoryBtn"`）+ 成长剧情弹层（`MascotStoryModal/Title/Text/Close`）

**E2E（新增）**
- `src/e2e/features/mascot-story.feature`（新）+ `src/e2e/support/pages/mascot.ts`（新）+ `src/e2e/step-definitions/mascot.steps.ts`（新）— 1 scenario / 5 steps
- `src/e2e/cucumber.mascot.js`（新）— 仅跑 mascot 单 feature 的专用配置

**文档**
- `features/ai-603.md`（设计文档，状态 → done）
- `docs/quality/ai-603-gate.md`（本报告）
- `features/backlog.md` — AI-603 → `done`

## 关键修复 / 环境坑（本次踩到并固化）

1. **jest / tsc 不能用 `.bin/*` bash 脚本**：`node ./node_modules/.bin/jest` / `.bin/tsc` 报 `SyntaxError`（bash 脚本）。改用 `node ./node_modules/jest/bin/jest.js` / `node ./node_modules/typescript/lib/tsc.js` 入口。spec 的 `storyRepo.create` mock 用 `(p?: any)` 满足 `Repository.create` 零参重载（否则 tsc 报 `TS2322`）。

2. **E2E 端口被上次会话遗留 server 占用**：`:4000` / `:3000` 被之前会话的 NestJS / Next 占用（`EADDRINUSE`），旧 server 无 mascot 路由 → `/ai/mascot/level` 404。E2E 前须 `netstat` 定位并 `taskkill` 杀掉占用进程，再启动本会话的 backend/frontend。

3. **`server/.env` 默认 `AI_PROVIDER=bigmodel` 无 key**：真实调用返回空 → `parseMascotStoryOutput("")` 抛「输出为空」→ 降级模板（`isDefault:true`）。与设计文档「无 key 环境用 MockProvider 演示」不符。E2E 后端改用 `AI_PROVIDER=mock` 启动，走 MockProvider fixture（`isDefault:false`，标题「小狐狸的勇气披风」）。

4. **E2E 用 `next build` + `next start` 生产模式**（`:3000` 预编译毫秒级响应）替代 `next dev`（按需编译会卡死整台 server）。

## 验证

- 后端 `tsc -p tsconfig.json --incremental false`：EXIT 0，0 错误。
- 后端 `mascot-story.service.spec`：9 PASS（含全部 `getLevelInfo`/`getOrGenerateStory` 分支）。
- 前端 `src/lib/mascotLevel.spec`：4 PASS；`next build` 0 错误（12 路由编译成功）。
- 前端 `next build` + `next start` 生产模式启动正常（:3000 listening，预编译路由）；后端 `node dist/main.js`（Node 20，`AI_PROVIDER=mock`）启动（:4000，`/ai/mascot/level`→200、`/ai/mascot/story/1`→200 mock fixture）。
- E2E `mascot-story.feature`：1 scenario / 5 steps 全绿（msedge 通道，免 Chromium 下载）。

四质量门 + 提交（不 push）放行。
