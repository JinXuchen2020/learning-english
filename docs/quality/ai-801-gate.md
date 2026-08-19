# AI-801 质量门报告

> Feature: AI-801 — 学习计划 → 课程生成（Plan-to-Course Generation）
> 分支: `feat/ai-801` | 日期: 2026-08-18 | 栈: node-ts (Next.js 14 前端 + NestJS 10 后端)

## 1. 四门结果

| 门 | 结果 | 证据 |
|---|---|---|
| consistency | **PASSED** | 后端 `nest build`（tsc）通过；前端 `tsc --noEmit` 0；e2e `tsc`（src/e2e/tsconfig.json）0；后端 jest AI-801 相关 4 套件 18/18 全绿（courses-from-plan.schema / plan.service.generate-courses / courses.service.create-course / courses.service Word 注入回归修复）；无类型错误 |
| tests | **PASSED（user-accepted-ci）** | 本地 jest 18/18（validateCoursePlan 合法/非法、createCourseFromPlan 事务落库计数+FK+simple-array 往返、generateCoursesForPlan 404/AI 成功/重试/降级模板、courses.service Word 仓库注入回归修复）；新增 `plan-courses.feature` 端到端场景 + POM/步骤扩展，e2e `tsc` 0；全量 E2E 实跑交 CI `e2e` job 兜底（本机 next dev 起不来，见项目护栏） |
| review | **PASSED** | 对抗式自检 0 open（见 §2） |
| optimization | **PASSED** | 0 open：无死代码/裸 console，模板降级与 schema 校验均纯函数化，事务原子落库（见 §2） |

> `tests` 门经**用户显式接受「E2E 交 CI `e2e` job 兜底」**，在 `gates.tests` 标注 `user-accepted-ci`，故 `tests:PASSED` 合规放行（非 agent 私自自报）。本地仅能跑 jest + e2e tsc（E2E 浏览器实跑需全栈 boot，本机 next dev 受限），全量 E2E 由 CI 注入 `AGNES_API_KEY` 后由 `e2e` job 验证。

## 2. review 对抗式自检

- **空安全 / 类型契约**：`courses.service.ts` 新增 `Word` 仓库注入（`getRepositoryToken(Word)`），并同步修复既有 `courses.service.spec.ts`（补 `{ provide: getRepositoryToken(Word), useValue: {} }`），避免回归 4 测试失败；`createCourseFromPlan` 用事务 `manager.transaction` 原子落库 Course→Lessons→Words，`options` 以数组传入 simple-array 列、`correctIndex` 必填、`category=title.slice(0,50)`、`color=spec.course.color||null`、`illustration` 省略（列 nullable → NULL），类型与 `Word` 实体严格对齐（修复初版 `illustration:null` 触发 `TS2769`）。
- **错误映射**：`generateCoursesForPlan` 计划不存在 → `NotFoundException {code:'PLAN_NOT_FOUND'}`（HTTP 404）；`GenerateCoursesDto.wordsPerLesson` 经 class-validator（IsInt/Min(3)/Max(8)）拦截非法 → 400；与 `generatePlan`「出错即抛」不同，课程写路径采用「重试 ≤3 + 模板降级」，**永不 500**，保证「生成配套课程」按钮永远可用（degraded 仍 200）。
- **事务 / 原子性**：落库在单次事务内完成，Course/Lesson/Word 三者要么全可见要么全不（避免半截课程被 `/courses` 读到）。
- **死代码 / 残留**：无新增 TODO/stub；`courses-from-plan.schema.ts` / `.prompt.ts` / `.template.ts` / `dto/generate-courses.dto.ts` 各司其职，无重复抽象；`deriveCourseSpec` 为纯函数（无副作用，便于单测）。
- **日志**：仅用 `Logger`（无裸 console）；`generateCoursesForPlan` 记录降级/落库日志经 Nest `Logger`。
- **路由正确性（本次收尾修复）**：原 `handleGenerateCourses` 写 `router.push('/courses')`，但课程列表页实际路由是 `/course`（单数，与 `TabNav` `href:'/course'` 一致），`/courses` 无页面会 404。已改为 `router.push('/course')`，否则整个「生成配套课程→看新课」闭环在真实浏览器必断。

## 3. 设计偏离（如实说明，不夸大）

`StudyPlan` 实体**不持久化** `level` / `interests` / 周 theme（`AI-203` 设计但断线），仅存每天 `title` 与 `content`（JSON 化 lessons）。因此：
- `deriveCourseSpec` 的 `level` 默认 `'a1'`；
- 课程标题 / 每节标题由 `day.title` 清洗（去「第 N 天 / Day N」尾缀）或回退当日 `content` 首 lesson 标题推导。

该偏离不影响「由计划真实生成可学习的 Course+Lesson+Word」主目标，已在 `features/ai-801.md §6` 与本文档如实记录；后续若需计划↔真实课程引用落地，属 `AI-803`（计划→已有目录课程引用与导航）范畴。

## 4. E2E 范围

新增 `src/e2e/features/plan-courses.feature`：场景「应用计划 → 生成配套课程 → 在 `/course` 看到新课（相对计数 +1）」。扩展 `PlanPage`（`isGenerateCoursesVisible` / `clickGenerateCourses`）、`CoursePage`（`openCourseList` / `courseCount`）、`world.ts`（`coursesBefore`）；`plan.steps.ts` 新增 4 个步骤。`e2e tsc` 通过。全量 E2E 实跑交 CI 验证（user-accepted-ci）。

## 5. 改动文件清单（含本会话收尾）

后端（NestJS）：
- `server/src/plan/courses-from-plan.schema.ts`（validateCoursePlan + 类型）
- `server/src/plan/courses-from-plan.template.ts`（buildFallbackCoursePlan + WORD_POOL/PALETTE）
- `server/src/plan/courses-from-plan.prompt.ts`（COURSE_FROM_PLAN_SYSTEM_PROMPT / buildCourseFromPlanUserPrompt）
- `server/src/plan/dto/generate-courses.dto.ts`（GenerateCoursesDto）
- `server/src/plan/plan.types.ts`（GenerateCoursesResponse）
- `server/src/plan/plan.service.ts`（deriveCourseSpec 等模块函数 + generateCoursesForPlan + 注入 CoursesService）
- `server/src/plan/plan.controller.ts`（POST :id/generate-courses）
- `server/src/plan/plan.module.ts`（import CoursesModule）
- `server/src/courses/courses.service.ts`（createCourseFromPlan 事务写 + Word 仓库注入）
- `server/src/courses/courses.module.ts`（forFeature Word + 导出 CoursesService）
- `server/src/plan/courses-from-plan.schema.spec.ts` / `plan.service.generate-courses.spec.ts` / `courses.service.create-course.spec.ts` / `courses.service.spec.ts`（回归修复）

前端（Next.js）：
- `src/lib/types.ts`（GenerateCoursesDto / GenerateCoursesResponse）
- `src/lib/api.ts`（generateCoursesForPlan）
- `src/app/[locale]/plan/page.tsx`（GenerateCoursesBlock + handleGenerateCourses，**路由修正 `/courses`→`/course`**）
- `src/messages/{zh,en}.json`（Plan.generateCourses* 等键）
- `src/e2e/features/plan-courses.feature` + `src/e2e/support/pages/{plan,course}.ts` + `src/e2e/support/world.ts` + `src/e2e/step-definitions/plan.steps.ts`

文档：
- `features/backlog.md`（AI-801 → done）
- `features/ai-801.md`（状态/验收/§6 实施备注）
- `docs/ai-integration.md`（新增 `POST /api/ai/plan/:id/generate-courses` 端点与前端说明）
- `docs/quality/ai-801-gate.md`（本报告）
- `.quality-gate.json`（四门状态，`tests=user-accepted-ci`，cleared:true）
