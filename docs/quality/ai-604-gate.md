# AI-604 质量门报告 — AI 绘本生成

- **Phase**: ai-604
- **Stack**: node-ts (NestJS 10 + TypeORM + better-sqlite3 / Next.js 14)
- **Branch**: feat/ai-604（从 feat/ai-603 派生；提交不 push，merge/push 由用户决定）
- **日期**: 2026-08-09
- **Gate 文件**: `.quality-gate.json`（扁平，`cleared:true`，`enforced:true`）

## 四道质量门结论

| 门 | 结论 | 关键证据 |
|----|------|----------|
| consistency | ✅ PASSED | 后端 `tsc -p tsconfig.json --incremental false` 全量类型检查 EXIT 0（0 错误）；前端 `next build` 类型检查 0 错误（**13 路由**编译成功，含 `/picture-book`）；全栈契约对齐：`PictureBook`/`PictureBookPage` 两端一致（`server/src/ai/picture-book-agent.ts` 与 `src/lib/types.ts` 同口径）；`GET /ai/picture-book/story` 与前端 `getPictureBook(userId, courseId?)` 路径/参数一致；`POST /ai/picture-book/tts` 与 `requestPictureBookTts(text)` 对齐；`PictureBook` 实体加入 `appEntities` + `TypeOrmModule.forFeature`（含 `Course`/`Lesson`）；`TabNav` 新增「绘本」入口 |
| tests | ✅ PASSED | **unit**: 后端 `picture-book-agent.spec`（解析：合法 JSON / 非法 JSON / 围栏剥离 / 缺失 title/pages 抛错；`computeWordCoverage` 覆盖率）+ `picture-book.service.spec` 共 **21 PASS**（`getOrGenerateBook` 幂等不调 AI / 首次 AI 生成 / AI 抛错降级 / 唯一约束 race 回查 / 空课程返回空单词；mock repos + mock AiProvider）；前端 `vitest` 全量通过；**e2e/bdd**: `picture-book.feature` **1 scenario / 4 steps 全绿**（登录新用户→看到绘本区→点示例绘本→弹层标题非空 + ≥1 页文本非空），数据钩子 `data-component=PictureBookSection`/`ViewSampleBookBtn`/`PictureBookModal`/`Title`/`Text` 可断言；step 文本唯一无 ambiguous；普通 `<button>` 点击无 Next.js `<Link>` 卸载竞态 |
| review | ✅ PASSED | 0 open；`getOrGenerateBook` 幂等（已有直接返回）+ 唯一约束 race 回查（UNIQUE 冲突回查不 5xx）；AI 失败/解析失败降级模板 `isDefault:true` 不抛 5xx（修复 userId 必传后降级 persist 成功，不再 NULL→500）；绘本「配图」用 `illustrationPrompt` 文本诚实标注（项目无文生图 provider，已在文档/UI 标注）；MockProvider `PICTURE_BOOK` 意图**优先于 STORY**（避免 `mascotName:'小狐狸'` 误命中 STORY 致总降级）保证无 key 环境演示**真实生成**（`isDefault:false`）；无裸 console |
| optimization | ✅ PASSED | 0 open；按需生成（前端点击触发）避免阻塞学习写入；`parsePictureBookOutput`/`computeWordCoverage` 纯函数单一真相；无 stub；降级路径真实可用（MockProvider 返回合法 JSON 或解析失败走模板）；幂等缓存避免重复 AI 调用（同 `userId+courseId` 仅生成一次） |

## 本次新增/修改文件

**后端（新增/修改）**
- `server/src/ai/picture-book.entity.ts`（新）— `PictureBook`（`@Entity('picture_books')`，`@Unique(['userId','courseId'])`，字段 `id`/`userId`/`courseId`/`title`/`storyText`/`pages`(JSON 文本)/`coverImagePrompt`/`isDefault`/`createdAt`）
- `server/src/ai/picture-book-agent.ts`（新）— `PICTURE_BOOK_SYSTEM_PROMPT`/`DEFAULT_BOOK_*`/`PictureBookAgentOutput`/`parsePictureBookOutput`（鲁棒解析，兼容围栏/缺失字段→抛错交由降级）/`computeWordCoverage`
- `server/src/ai/picture-book.service.ts`（新）— `getOrGenerateBook`（幂等 + 失败降级 + 唯一约束 race 回查）/`synthesizeTts`
- `server/src/ai/picture-book.controller.ts`（新）— `GET('story')` / `POST('tts')`
- `server/src/ai/picture-book-agent.spec.ts` + `server/src/ai/picture-book.service.spec.ts`（新）— 共 21 例单测
- `server/src/ai/mock-ai.provider.ts` — 新增 `PICTURE_BOOK_KEYWORDS` + `MOCK_PICTURE_BOOK_TEXT` fixture（**检查顺序在 STORY 之前**）
- `server/src/ai/ai.module.ts` / `server/src/config/database.config.ts` — 注册 `PictureBook`（+ `Course`/`Lesson` forFeature）

**前端（新增/修改）**
- `src/lib/types.ts` — 新增 `PictureBook` / `PictureBookPage`
- `src/lib/api.ts` — 新增 `getPictureBook(userId, courseId?)`（**带 userId**）/ `requestPictureBookTts(text)`
- `src/app/picture-book/page.tsx`（新）— 课程选择器 + 示例绘本 + 阅读器（每页朗读按钮 `playTts`）
- `src/components/TabNav.tsx` — 新增「绘本」导航入口

**E2E（新增）**
- `src/e2e/features/picture-book.feature`（新）+ `src/e2e/support/pages/pictureBook.ts`（新）+ `src/e2e/step-definitions/picture-book.steps.ts`（新）— 1 scenario / 4 steps
- `src/e2e/cucumber.picture-book.js`（新）— 仅跑 picture-book 单 feature 的专用配置

**文档**
- `features/ai-604.md`（设计文档，状态 → done）
- `docs/quality/ai-604-gate.md`（本报告）
- `features/backlog.md` — AI-604 → `done`

## 关键修复 / 环境坑（本次踩到并固化）

1. **致命 500：前端 `getPictureBook` 漏传 userId**（✅ 已修）。原 `getPictureBook(courseId?)` 未传 `userId`，请求 `/ai/picture-book/story` 无 userId → 后端 `userId=undefined` → `persist` 时 `NOT NULL constraint failed: picture_books.userId` → **500**。修复：api 加 `userId` 参数，page 传 `user?.id`（与 mascot/speech 一致）。**教训：所有走 `userId` query 的 AI 接口，前端必须传 userId。**

2. **MockProvider 总降级：绘本意图被 STORY 抢先命中**（✅ 已修）。绘本 prompt 含 `mascotName:'小狐狸'`，`'小狐狸'` 在 `STORY_KEYWORDS` 中 → `pickChatFixture` 按 `PLAN→REPORT→STORY→PICTURE_BOOK` 顺序，STORY 先命中返回无 pages 的 `MOCK_STORY_TEXT` → parse 失败 → 降级。修复：把 `PICTURE_BOOK` 检查**移到 STORY 之前**（绘本关键词 `绘本`/`picture` 更具体，mascot prompt 不含这些）。

3. **jest / tsc 不能用 `.bin/*` bash 脚本**：`node ./node_modules/.bin/jest` / `.bin/tsc` 报 `SyntaxError`（bash 脚本）。改用 `node ./node_modules/jest/bin/jest.js` / `node ./node_modules/typescript/lib/tsc.js` 入口；cucumber 用 `node ./node_modules/@cucumber/cucumber/bin/cucumber.js`。

4. **E2E 端口被上次会话遗留 server 占用 + DB 锁**：`:4000` 被之前会话的 NestJS 占用（`EADDRINUSE`），且持有 `dev.sqlite` 写锁导致新 backend `synchronize` 同步卡死（进程静默无输出）。`TaskStop` 偶尔不彻底（残留进程仍监听），须 `netstat -ano | grep -E ':4000|:3000'` 定位 + `taskkill /PID <id> /F` 强制杀，再启本会话服务。

5. **E2E 用 `next build` + `next start` 生产模式**（`:3000` 预编译毫秒级响应）替代 `next dev`（按需编译卡死整台 server）。

6. **`server/.env` 默认 `AI_PROVIDER=bigmodel` 无 key**：真实调用返回空 → 降级。E2E 后端须 `AI_PROVIDER=mock` 启动走 MockProvider fixture（`isDefault:false`，标题「[Mock] 小狐狸的彩虹单词王国」）验证真实生成路径。

## 验证

- 后端 `tsc -p tsconfig.json --incremental false`：EXIT 0，0 错误。
- 后端 `picture-book.*.spec`：21 PASS（含解析全部分支 + `getOrGenerateBook` 幂等/降级/race/空课程）。
- 前端 `vitest` 全量通过；`next build` 0 错误（13 路由编译成功）。
- 前端 `next build` + `next start` 生产模式启动正常（:3000 listening）；后端 `node dist/main.js`（Node 20，`AI_PROVIDER=mock`）启动（:4000，`/ai/picture-book/story?userId=<new>` → 返回 `[Mock] 小狐狸的彩虹单词王国` `isDefault:false` 3 页）。
- E2E `picture-book.feature`：1 scenario / 4 steps 全绿（msedge 通道，免 Chromium 下载；404 为 favicon 无害）。

四质量门 + 提交（不 push）放行。
