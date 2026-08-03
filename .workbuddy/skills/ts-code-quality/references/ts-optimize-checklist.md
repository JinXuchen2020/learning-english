# TS/NestJS/Next.js 优化 checklist（optimize 模式）

逐维度扫「生产就绪度 / 清洁度」，任何命中即记为 open finding 并最小修复。目标：0 open、替换 stub、清理噪音、统一范式。

---

## 1. 替换占位 / 未完成实现（P0/P1）

- [ ] **Stub/占位返回**：是否有硬编码 `APPROVED`、返回假数据、`throw new Error('not implemented')`、模拟动作的方法？必须（a）实现真实逻辑，或（b）记为 open P1 并引用设计文档授权的豁免 → P0/P1。
- [ ] **TODO/FIXME/HACK**：是否清理或立项追踪？长期裸 TODO 视为债务 → P2。
- [ ] **`if (false)` / 死分支**：调试遗留的条件开关 → P2。

## 2. 清理未用 / 噪音（P3）

- [ ] **未用导出/导入/变量**：删除不被引用的导出、import、局部变量（保留公共 API 意图明确的除外）。
- [ ] **`console.*` 残留**：生产代码改用 `Logger`（NestJS）/结构化日志；删除调试 `console.log` → P3。
- [ ] **注释噪音**：删除被代码自解释的废注释、大段被注释的旧代码 → P3。
- [ ] **调试器语句**：`debugger`、`/* eslint-disable */` 滥用清理 → P3。

## 3. 统一错误处理（P1/P2）

- [ ] **全局异常过滤器**：NestJS 是否配 `Global ExceptionFilter`，统一错误响应形状（避免 500 裸露、泄露堆栈）→ P2。
- [ ] **前端错误归一化**：`lib/api.ts` 是否统一 `ApiError` 形状，提取 `body.message/error` 兜底，避免 `undefined.message` → P2。
- [ ] **重复 try/catch**：多处相同错误处理是否抽为辅助/拦截器 → P3。

## 4. 去重 / 收敛（P2/P3）

- [ ] **重复逻辑**：多处相同的校验/转换/格式化是否抽为共享 util/pipe → P3。
- [ ] **重复的 DTO/类型**：前后端重复的响应模型是否收敛为单一来源（如 `lib/types.ts` 或共享 schema）→ P2。
- [ ] **重复的 mock 数据**：是否收敛到 `lib/mockData.ts` 或测试 fixtures → P3。

## 5. 配置集中（P2）

- [ ] **硬编码配置**：超时/重试/分页大小/外部 URL 是否提取到 `ConfigService`/环境变量/常量 → P2。
- [ ] **环境分支**：`process.env.NODE_ENV` 判断是否集中、无散落 → P3。

## 6. 性能（后端 P1/P2，前端 P2/P3）

- [ ] **N+1 查询**：循环中按 id 逐个 `findOne` 是否改为 `In(...)` 或 `leftJoinAndSelect` 一次取 → P1。
- [ ] **缺失索引/分页**：大表查询是否缺 `take/skip`、缺 `where` 全表扫描 → P2。
- [ ] **缓存**：热点只读（如课程列表/配置）是否可加内存/Redis 缓存 → P3。
- [ ] **前端 bundle/SSR**：`next` 中 `useState` 大列表、`useClient` 误用导致客户端沉重；是否拆分 client/server 边界、用 `next/dynamic` 懒加载 → P2。

## 7. 资源生命周期（P1）

- [ ] **定时器/订阅泄漏**：`setInterval`/`subscribe`/`EventEmitter` 是否在 `onModuleDestroy`/`useEffect` cleanup 释放 → P1。
- [ ] **连接复用**：TypeORM `DataSource` 单例复用，杜绝每请求新建 → P1。

## 8. 类型健康（P2）

- [ ] **`any` 清理**：将 `any` 收敛为具体类型/`unknown`+收窄 → P2。
- [ ] **非空断言替换**：`obj!.x` 改为可选链 + 守卫 → P2。

## 9. 测试卫生（P3）

- [ ] **假绿测试**：仅「无异常抛出」的测试是否补真实断言 → P3。
- [ ] **测试与实现漂移**：重命名/改签名后是否同步更新 spec → P3。

## 10. 收尾核对

- [ ] 每轮修复后跑 `${BUILD_CMD}`+`${TYPECHECK_CMD}`+`${TEST_CMD}` 全绿才算回归通过。
- [ ] 遗留无法修的问题写入报告「已知遗留」章节，不静默放过。
