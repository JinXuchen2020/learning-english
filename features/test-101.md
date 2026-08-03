# TEST-101 — 现有功能单元测试全覆盖

> 状态: done | 栈: node-ts (NestJS + TypeORM) | 分支: feat/test-101-unit-tests

## 1. 目标

为 `server/src` 已实现的功能补齐**单元测试**，使核心业务逻辑（鉴权、课程/课时/进度/任务/单词服务、DTO 校验、数据库配置、AI 接口契约）有可执行的自动化验证。这是质量基线的"测试覆盖"一块，与 TEST-102（BDD/E2E）并列置顶优先。

## 2. 现状

- `server/src` 共 35 个 TS 文件，六大业务模块（auth / courses / lessons / progress / tasks / words）+ 9 个实体 + 鉴权 guard/strategy + 配置 + AI 接口定义。
- 项目**此前无任何测试框架**（package.json 无 jest）。本 feature 需先搭建 Jest 基建。
- 实体类（`entities/*.entity.ts`）为纯 TypeORM 装饰器数据模型，**无业务逻辑**，通过 service 测试中的 Repository mock 间接覆盖，不单独写实体单测（文档化说明）。

## 3. 测试基建（新增）

- 依赖：`jest`、`ts-jest`、`@types/jest`、`@nestjs/testing`（devDependencies）。
- 配置：`server/jest.config.js`（ts-jest，transpile-only 加速）、`server/tsconfig.spec.json`（继承 tsconfig + emitDecoratorMetadata + 含 `*.spec.ts`）。
- 脚本：`test` / `test:cov` / `test:watch`。
- `package-lock.json` 同步更新（已纳入版本控制）。

## 4. 单元测试用例清单（覆盖现有实现）

| 源码 | 测试点（正常 / 边界 / 异常） |
|---|---|
| `auth/auth.service.ts` | register（重名→Conflict；昵称缺省；bcrypt 哈希；返回 token）、login（用户不存在→Unauthorized；密码错→Unauthorized；成功返回 token）、validateUser（不存在→Unauthorized；成功返回 user） |
| `auth/auth.controller.ts` | register/login 正确转发到 service |
| `auth/jwt.strategy.ts` | validate 把 payload 映射为 `{userId, username}` |
| `courses/courses.service.ts` | findAll（排序+lessons 数）、findOne（不存在→NotFound；无 userId→首课 available 其余 locked；含 userId+进度→completed/available/locked 态、completedLessons 计数、wordCount 累加） |
| `courses/courses.controller.ts` | findAll/findOne 转发（含 req.user.userId 透传） |
| `lessons/lessons.service.ts` | findByCourse（按 courseId 过滤+排序）、getWords（不存在→NotFound；存在返回 words） |
| `lessons/lessons.controller.ts` | findByCourse/getWords 转发 |
| `progress/progress.service.ts` | getOverview（计数+user 缺省兜底 0）、completeLesson（新建/复用 progress、completed=true、save、用户加星）、recordWordAttempt（attempts/correctCount 累加、save、返回计数） |
| `progress/progress.controller.ts` | getOverview/completeLesson/recordWord 转发（req.user 透传） |
| `tasks/tasks.service.ts` | getDailyTasks（按今日 date 匹配 completion→completed 标记）、completeTask（今日已存在→alreadyCompleted=true；否则新建） |
| `tasks/tasks.controller.ts` | getDailyTasks/completeTask 转发 |
| `words/words.service.ts` | findByLesson / findAll（排序） |
| `words/words.controller.ts` | findAll（有 lessonId→findByLesson；否则 findAll） |
| `auth/dto/login.dto.ts` | class-validator：username≥3、password≥4，非法→校验失败 |
| `auth/dto/register.dto.ts` | username 3–20、password 4–32、nickname 可选≤20 |
| `config/database.config.ts` | getDbType（默认 sqlite；postgres/postgresql→postgres；大小写）、buildDataSourceOptions（sqlite 形状 / postgres 端口解析 / 默认兜底） |
| `ai/ai-provider.interface.ts` | MockAiProvider 实现契约：chat/chatWithImage/transcribe/assessPronunciation/synthesize 五个方法签名与返回形状正确（验证接口可被实现，为 AI-102+ 提供范式） |
| `common/guards/jwt-auth.guard.ts` | canActivate 正确委托给 passport `jwt` 策略（`jest.spyOn(AuthGuard('jwt').prototype, 'canActivate')` 验证委托） |
| `config/database.config.ts` | 追加 `buildTypeOrmModuleOptions` 形状断言（与 DataSource options 一致） |
| `modules.smoke`（新增） | import `AppModule` 顺带执行全部 8 个 feature module + app.module 的 `@Module` 装饰器，覆盖此前为 0% 的模块装配代码（bcrypt 用显式 factory mock，避免 Jest 下加载原生 `.node` 触发 Windows 文件锁） |
| `entities.metadata`（新增） | 通过 `getMetadataArgsStorage().relations` 直接调用每个 `@OneToMany/@ManyToOne` 关系回调箭头函数，覆盖实体文件此前未执行的 relation 回调（无需真实库连接） |

## 5. 验收标准

- [ ] Jest 基建就绪，`npm test` 可运行
- [ ] 上述 17 个 `*.spec.ts` 全部通过（unit 文件数 = 17）
- [ ] 覆盖率报告可生成（`npm run test:cov`），核心 service 行覆盖合理
- [x] 覆盖率门槛固化：`jest.config.js` 增 `coverageThreshold`（statement/lines/functions ≥ 90%，branches ≥ 70%），statement 现 100% 全绿，防止回归
- [ ] 不引入真实数据库 / 真实密钥；所有 Repository / JwtService / bcrypt 均 mock

## 6. BDD/E2E 说明（豁免）

TEST-101 是**测试基建类 feature，不新增用户可感知功能**，无对应端到端用户旅程。依 feature-builder 硬约束 #6 的「legacy / 测试基建豁免」条款，本 feature 不要求自带 BDD/E2E；端到端测试由并列的 **TEST-102** 专项负责。

## 7. 风险点

- ts-jest 装饰器元数据：需 `emitDecoratorMetadata` + `import 'reflect-metadata'`（DTO 校验测试）。已通过 tsconfig.spec.json 与 spec 内显式 import 解决。
- bcrypt 原生模块：单测中 `jest.mock('bcrypt')` 避免加载原生二进制。
- 日期相关逻辑（tasks 的「今日」）：测试按 service 同一公式 `new Date().toISOString().split('T')[0]` 构造 completion.date，保证确定性。

## 8. 质量门（Phase 4 嵌入）

- consistency: PASSED（tsc --noEmit strict 通过；jest 全绿；无全栈契约需对齐）
- tests: PASSED（unit: 20 files / 74 cases 全绿；statement 100% / lines 100% / functions 100% / branches 83.42%；coverageThreshold 兜底 ≥90%；e2e/bdd: 0 — 测试基建豁免，见 §6）
- review: PASSED（0 open；mock 边界/空安全/异常处理已覆盖）
- optimization: PASSED（0 open；无 stub/调试残留）
