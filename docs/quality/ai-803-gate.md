# AI-803 质量门报告

> Feature: AI-803 — 学习计划 → 真实课程引用落地与学习导航（Plan→Course Reference & Navigation）
> 分支: `feat/ai-803`（自 `feat/ai-801` 切出）| 日期: 2026-08-18 | 栈: node-ts (Next.js 14 前端 + NestJS 10 后端)

## 1. 四门结果

| 门 | 结果 | 证据 |
|---|---|---|
| consistency | **PASSED** | 后端 `nest build`（tsc）通过；前端 `tsc --noEmit` 0；e2e `tsc`（src/e2e/tsconfig.json）0；后端全量 jest 897/897 全绿（含本 feature 新增 `plan.service.spec`/`courses.service.spec` 与修复 `plan.controller.spec` 的 `CoursesService` 注入回归） |
| tests | **PASSED（user-accepted-ci）** | 本地 jest（plan.service AI-803 目录注入 / buildStudyPlan lessonRefsJson / Plan A 拆课写引用列 / 无效 ref 降级无深链 / generateCourses 写回 + courses.service getCatalog / lessonExists / courseExists）+ 前端 vitest `tasks.spec` 10/10（isLessonTask / lessonTaskHref）+ 新增 `plan-lesson-deeplink.feature` 端到端场景，e2e `tsc` 0；全量 E2E 实跑交 CI `e2e` job 兜底（本机 next dev 起不来，见项目护栏） |
| review | **PASSED** | 对抗式自检 0 open（见 §2） |
| optimization | **PASSED** | 0 open：无死代码/裸 console；`parseLessonRefs` 回退 content 向后兼容；`getCatalog` 用 safe 默认不依赖缺列；`buildGenericEntry` 仅在无引用时生成 1 条通用任务避免任务膨胀（见 §2） |

> `tests` 门经**用户显式接受「E2E 交 CI `e2e` job 兜底」**，在 `gates.tests` 标注 `user-accepted-ci`，故 `tests:PASSED` 合规放行（非 agent 私自自报）。本地仅能跑 jest + vitest + e2e tsc（E2E 浏览器实跑需全栈 boot，本机 next dev 受限），全量 E2E 由 CI 注入 `AGNES_API_KEY` 后由 `e2e` job 验证。

## 2. review 对抗式自检

- **空安全 / 类型契约**：`daily-task.entity.ts` 新增 `courseId`/`lessonId`/`skillType`/`source` 四列；`source` 初版 `default:'plan'` 会误标全局 seed 任务（其 `userId` 为 NULL），已改为 `nullable:true`（全局 seed 为 NULL、计划任务显式 `'plan'`）。`TasksService.PlanTaskEntry` 引用列全部可选、`getDailyTasks` 映射以 `?? null` 收口，`DailyTaskView` 透传 null 安全。
- **引用真实 / 保存期容错**：`applyPlan` 对每节 `lessonRef` 调 `coursesService.lessonExists/exists`，不存在 → 该任务**不写**深链列（字段缺省而非置 null 文本），**不抛、不整计划失败**；有效 ref 正常写 `courseId/lessonId/skillType` + `source:'plan'`。该「保存期容错」与生成期「出错即抛」边界已在 `features/ai-803.md §6` 与本文档如实区分。
- **目录注入**：`generatePlan` 经 `buildMessages`（async）调 `coursesService.getCatalog()`（try/catch：失败仅 warn 降级为「无目录」分支，不阻断生成），把真实课程/课时 id 喂给 `buildPlanUserPrompt(dto, catalog)` 的 `curriculumCatalog` 分支，使 AI 产出真实 UUID（而非空字符串被 `validatePlan` 放过的幻觉 id）。`hasCatalog` 要求 `courses.length>0 && lessons.length>0`，故默认 mock 空目录走「无目录」分支、非空走注入分支，两条路径均有单测覆盖。
- **AI-801 协同 / 写回**：`generateCoursesForPlan` 在 AI-801 创建课程后调 `writeBackGeneratedCourse`，把生成的真实 `courseId/lessonId` 回填进计划 `lessonRefsJson`（day i → generated lesson i），使后续 `applyPlan` 能深链到 AI-801 产出的课程；写回失败仅 warn，不影响主流程。
- **向后兼容**：`parseLessonRefs` 优先读 `lessonRefsJson`，为空时回退解析旧 `content` JSON，存量数据（两列皆空）不报错、退化为通用任务。`StudyPlanDay` 新列 `lessonRefsJson` 可空、dev `synchronize` 即生效。
- **DI 回归（已修）**：`PlanService` 现注入 `CoursesService`，导致 `plan.controller.spec.ts` 因缺 provider 失败 4 例——已补 `{ provide: CoursesService, useValue: {...} }`，全量 jest 复绿（897/897）。
- **日志**：仅用 Nest `Logger`（无裸 console）；`getCatalog` 失败、`writeBackGeneratedCourse` 失败均经 `logger.warn`。

## 3. 设计偏离（如实说明，不夸大）

- `StudyPlan` 仍不持久化 `level`/`interests`/周 theme（AI-203 设计但断线），`getCatalog` 对 `Lesson` 实体的 `skillType`/`level` 用 safe 默认值（`CATALOG_DEFAULT_SKILL='vocab'`、`CATALOG_DEFAULT_LEVEL='a1'`），因 `Lesson` 实体无此列——属已知 schema 缺口，不影响「按真实目录 id 引用导航」主目标。
- AI 产出引用的「真实存在性」只在 `applyPlan`（保存/应用期）校验，不在 `savePlan` 期（即 `savePlan` 不阻断、仅 `applyPlan` 校验）。这是 §6「保存期容错」的有意取舍，已在 `features/ai-803.md §1-2` 记录。

## 4. E2E 范围

新增 `src/e2e/features/plan-lesson-deeplink.feature`：场景「首页每日任务含 lessonId → 渲染『去学习』深链（data-component=LessonTaskLink）→ 点击跳 `/practice?lessonId=`」。扩展 `HomePage`（`enableLessonTask` 翻 daily-tasks 端点注入带 `lessonId` 任务 / `lessonTaskLinkCount` / `clickFirstLessonTask` / `practiceUrlMatches`）与 `home.steps.ts`（3 步）。断言基于稳定 `data-component` 与 URL 模式（CI 跑 zh），不依赖 locale 文案。全量 E2E 实跑交 CI 验证（user-accepted-ci）。

## 5. 改动文件清单

后端（NestJS）：
- `server/src/entities/daily-task.entity.ts`（courseId/lessonId/skillType/source 列）
- `server/src/plan/study-plan-day.entity.ts`（lessonRefsJson 列）
- `server/src/courses/courses.service.ts`（getCatalog / lessonExists / courseExists + lessonsRepo 注入）
- `server/src/courses/courses.service.spec.ts`（getCatalog / lessonExists / courseExists 单测 + lessonsRepo mock）
- `server/src/plan/plan.service.ts`（buildMessages async + getCatalog 注入、buildStudyPlan 写 lessonRefsJson、applyPlan Plan A 拆课写引用列 + 容错、generateCoursesForPlan 写回、模块函数 parseLessonRefs/buildGenericEntry/writeBackGeneratedCourse）
- `server/src/plan/plan.service.spec.ts`（CoursesService mock + AI-803 目录注入 / buildStudyPlan / Plan A / 无效 ref 降级 / 写回；更新旧 applyPlan 断言为 Plan A）
- `server/src/plan/plan.controller.spec.ts`（补 CoursesService provider 修复 DI 回归）
- `server/src/tasks/tasks.service.ts`（PlanTaskEntry 引用列可选 + DailyTaskView 透传 + getDailyTasks 映射）

前端（Next.js）：
- `src/lib/types.ts`（DailyTask 增加 courseId/lessonId/skillType/source）
- `src/lib/tasks.ts`（isLessonTask / lessonTaskHref）
- `src/lib/tasks.spec.ts`（isLessonTask / lessonTaskHref 单测，10/10）
- `src/app/[locale]/page.tsx`（LessonTaskLink 深链分支，data-component=LessonTaskLink，aria-label goToLesson）
- `src/messages/{zh,en}.json`（Home.goToLesson）
- `src/e2e/features/plan-lesson-deeplink.feature` + `src/e2e/support/pages/home.ts` + `src/e2e/step-definitions/home.steps.ts`

文档：
- `features/backlog.md`（AI-803 → done）
- `features/ai-803.md`（状态/§7 实施备注）
- `docs/quality/ai-803-gate.md`（本报告）
- `.quality-gate.json`（四门状态，`tests=user-accepted-ci`，cleared:true）
