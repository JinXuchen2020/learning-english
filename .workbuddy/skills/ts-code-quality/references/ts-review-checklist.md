# TS/NestJS/Next.js 对抗式审查 checklist（review 模式）

逐维度自查，任何命中即记为 open finding 并修复（P0→P1→P2→P3）。每个文件至少经过「类型安全 / 错误处理 / 安全注入」三维度；按文件类型叠加专属维度。

---

## A. 类型安全（通用，必做）

- [ ] **`any` 逃逸**：是否存在 `: any`、`as any`、`<any>`、`as unknown as any`？类型被绕过则失去编译期保护 → P2。
- [ ] **隐式 `any`**：函数参数/返回值未标注且无法推断（开启 `strict` 应已报错，未开则查）→ P2。
- [ ] **非空断言滥用**：`obj!.prop` 是否在确有把握非空处使用？误用致运行时 `undefined` 崩溃 → P1。
- [ ] **泛型/联合收窄**：`switch`/`if` 收窄是否穷尽？`never` 分支是否处理未知 case → P2。
- [ ] **DTO 与实体混用**：响应模型是否直接用实体（泄露内部字段）而非专用 DTO/响应类 → P2。

## B. NestJS DI 与生命周期（后端 service/controller/provider/guard/pipe/module）

- [ ] **`@Injectable()` 缺失**：被注入的类是否带装饰器？缺则 DI 解析失败 → P0。
- [ ] **Provider 未注册**：被构造注入的依赖是否在模块的 `providers`/`imports` 中提供？未注册 → P0。
- [ ] **Scope 误用**：有状态的 provider（如持有请求级上下文）是否误用默认单例（`DEFAULT`）而非 `REQUEST` scope？并发串数据 → P1。
- [ ] **循环依赖**：模块/provider 间循环依赖是否经 `forwardRef` 或重构消除？启动期或运行时 undefined → P1。
- [ ] **守卫/拦截器/管道顺序**：鉴权守卫是否在路由前执行？全局 vs 路由级是否预期 → P2。
- [ ] **Controller 路由契约**：`@Get/@Post` 路径、`@Param/@Query/@Body` 类型、`@HttpCode` 是否与前端调用一致 → P2（见维度 F）。

## C. 错误处理（通用，必做）

- [ ] **外部调用未捕获**：DB/网络/IO/第三方 API 调用是否 `try/catch` 并转译为有意义的错误（NestJS 抛 `HttpException`，前端抛可处理 Error）？裸 `await` 失败致进程/渲染崩溃 → P1。
- [ ] **吞异常**：`catch {}` 空块、仅 `console.log` 不重抛/不返回错误状态 → P1。
- [ ] **未处理 Promise**：是否有未 `await` 的异步（fire-and-forget）致竞态/漏更新 → P1。
- [ ] **错误归一化**：跨层异常是否统一形状（如 `ApiError`）？前端 `fetch` 封装是否提取 `body.message/error` 兜底 → P2。
- [ ] **全局异常过滤器**：NestJS 是否配 `Global ExceptionFilter` 统一错误响应？否则 500 裸露 → P2。
- [ ] **边界输入**：空集合 / 超大分页 / 首次无数据 / 并发写是否健壮 → P1。

## D. 安全与注入（通用，必做）

- [ ] **用户输入校验**：后端入参是否经 `class-validator` + `ValidationPipe`（`whitelist` 开启）？前端是否校验后提交 → P1。
- [ ] **SQL/ORM 注入**：是否用 TypeORM 参数化（`createQueryBuilder` 占位符 / `repository` API）而非字符串拼接？原生 SQL 拼接 → P0。
- [ ] **密钥/连接串**：是否走配置/环境变量（`ConfigService`/`.env`）而非硬编码？疑似硬编码 → P1。
- [ ] **认证/授权**：受保护路由是否挂 `@UseGuards(JwtAuthGuard)`？JWT 策略 `validate` 是否校验用户存在/状态 → P1。
- [ ] **XSS（React/Next）**：是否用 `dangerouslySetInnerHTML`？若必须，输入是否经 DOMPurify 等净化 → P1。
- [ ] **CORS/暴露**：生产 `cors` 是否限域？`next.config` 是否泄露内部 → P2。

## E. 并发与资源（有副作用的类必做）

- [ ] **订阅/定时器泄漏**：`setInterval`/`subscribe`/`EventEmitter`/`WebSocket` 是否在 `onModuleDestroy`/`useEffect` cleanup 释放？未释放 → P1。
- [ ] **DB 连接池**：TypeORM `DataSource` 是否单例复用？是否每请求新建连接 → P1。
- [ ] **文件/流**：读写流是否 `close`/`destroy`？大文件是否流式而非全量载入内存 → P2。

## F. API 契约对齐（全栈必做）

- [ ] **字段名/类型/可空**：后端 DTO 响应字段与前端 `lib/types.ts`/请求处逐字段比对，命名（驼峰/蛇形）、类型、可空、枚举值是否一致 → P2。
- [ ] **状态码**：成功/失败状态码是否符合前端预期（如 201 vs 200、401 vs 403）→ P2。
- [ ] **OpenAPI 漂移**：若后端暴露 Swagger，新增字段是否已同步 → P3。

## G. 测试面（review 模式必做）

- [ ] **逻辑分支源码有单测**：后端 service/controller/provider/guard/pipe/工具函数，前端纯逻辑模块（`lib/api.ts`/hooks/带分支工具）是否有对应 `*.spec.ts` 覆盖正常/边界/异常 → P2（缺则 open）。
- [ ] **纯展示组件豁免**：`components/*`/`app/*/page.tsx` 无单测，但其 UI 行为须有 BDD/E2E 覆盖 → P2（缺 E2E 则 open）。
- [ ] **断言有效性**：测试断言是否为真实行为，而非「无异常抛出」或仅验证 mock 被调用 → P3。
- [ ] **mock 真实性**：mock 是否贴近真实（如 `Repository.create` 返回拷贝而非同引用被突变）→ P3。

## H. 死代码 / 魔法值 / 日志（通用）

- [ ] **未用导出/导入**：是否有死后不被引用的导出、死分支 → P3。
- [ ] **魔法值**：写死的端口/路径/ID/超时是否提取为常量/配置 → P3。
- [ ] **日志规范**：生产是否用 `Logger`（NestJS）/结构化日志而非 `console.*`？日志是否泄露敏感信息（token/密码）→ P2。
- [ ] **TODO/FIXME/HACK**：是否标记未完成项？若为真实待办需立项或豁免说明 → P2。

## Z. 通用收尾（所有文件）

- [ ] **命名/分层一致性**：是否贴合项目既有约定（由 feature-builder Phase 0 探测的 `${STACK}`/目录约定）→ P3。
- [ ] **可读性**：长方法/嵌套是否可拆？注释是否解释 why 而非 what → P3。
