# TEST-101 质量门报告

> phase: test-101 | stack: node-ts (NestJS + TypeORM) | cleared: true | enforced: true
> 报告时间: 2026-08-03

## 概要

为 `server/` 现有功能补齐单元测试基建与用例，建立可持续运行的测试体系。共新增 **17 个 `*.spec.ts`**、**70 个用例**，全部通过；并修复 1 个在测试覆盖中暴露的真实缺陷。

## 四道质量门

### 1. consistency（一致性）— PASSED
- `tsc --noEmit -p tsconfig.json`：0 errors（含 spec 文件类型检查）
- `npm run build`（nest build）：0 errors
- `jest --runInBand`：17 suites / 70 tests 全绿
- 无全栈契约需对齐（纯后端，前端不在本仓库联动范围）

### 2. tests（测试）— PASSED
- **单元测试**：17 spec files / 70 cases 全绿
- **覆盖率**（jest --coverage）：
  - 总：statement 77.96% / branch 81.21% / funcs 66.66% / lines 80.25%
  - 核心逻辑（service / controller / auth / config / dto）：100% 或 83%+（≥80% 达成）
  - 0% 项：`*.module.ts`、`app.module.ts`、实体类 —— 均为纯装配/装饰器、无业务方法，符合设计文档「实体/模块经 service mock 间接覆盖」说明
- **BDD/E2E**：0 场景 —— 本 feature 是**测试基建类**，不新增用户可感知功能，依 feature-builder 硬约束 #6「legacy / 测试基建豁免」条款豁免；端到端测试由并列的 **TEST-102** 专项负责

### 3. review（代码审查）— PASSED（0 open）
- 修复真实缺陷 `ProgressService.recordWordAttempt`：`Repository.create({userId, wordId})` 不套用 DB 默认值，`attempts`/`correctCount` 初值为 `undefined`，后续 `+= 1` 得 `NaN`（污染数据）。已在创建时显式初始化为 0。
- 边界/空安全/异常分支：所有 service 的 NotFound / 缺省兜底 / 已存在分支均已覆盖。
- 测试隔离：Repository / JwtService / bcrypt 全部 mock，未连真实数据库、未加载 bcrypt 原生二进制（factory mock + `--runInBand` 规避 Windows 并行文件锁）。

### 4. optimization（优化）— PASSED（0 open）
- 无 stub / 调试残留代码。
- 将 ts-jest 的 `isolatedModules` 配置迁移至 `tsconfig.json`，消除 ts-jest v30 弃用警告，并为将来版本兼容。

## 变更文件清单
- 新增基建：`server/package.json`(devDeps+scripts)、`server/jest.config.js`、`server/tsconfig.spec.json`、`server/test/setup.ts`
- 新增测试：17 × `src/**/*.spec.ts`
- 源码修复：`server/src/progress/progress.service.ts`（recordWordAttempt 初始化）
- 配置：`server/tsconfig.json`（isolatedModules）
- 文档：`features/test-101.md`、本报告

## 遗留 / 后续
- TEST-102：BDD/E2E 端到端测试（用户旅程级，非 API 级）。
- 后续新 feature 自带测试将沿用本基建（`npm test`），并由 `.quality-gate.json` 的 `tests` 门强执。
