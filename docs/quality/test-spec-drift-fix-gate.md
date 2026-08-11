# 质量门报告 — test-spec-drift-fix

> 纯测试维护提交：修复两处随代码/时间漂移的测试期望。无生产逻辑改动。

## 背景
CI / 本地 `npm test` 出现两处失败，经核对均为**测试期望落后**而非功能缺陷：

1. `server/src/auth/auth.controller.spec.ts`
   - `RegisterDto` 含可选 `role` 字段；`AuthController.register` 正确透传 → 真实调用为 4 参（`'a','b','c',undefined`）。
   - spec 原只断言 3 参 → mismatch。
   - 修法：`toHaveBeenCalledWith('a','b','c',undefined)`。
2. `server/src/ai/weekly-report.service.spec.ts`
   - `generateAndSendWeeklyReport` 不传 `weekStart` 时默认用**当前周周一**（`opts?.weekStart ?? todayUtc()`）。
   - spec 的 `WS` 硬编码成写测试那周的 `'2026-08-03'`，真实日期跨周后 mismatch（本次实际 `2026-08-10`）。
   - 修法：新增 `currentWeekMonday()`（与 service `weekStartOf(todayUtc())` 同 UTC 口径），`WS` 改为动态计算。
   - 注意：`buildWeeklyReport` 块的 `WS='2026-08-03'` 是显式传入且配套固定测试数据，未动。

## 质量门（四道均 PASSED）

| 门 | 结果 |
|----|------|
| consistency | nest build / 前端 tsc 无改动需重编译；仅改 `.spec.ts`，无生产逻辑/类型/路由变更 |
| tests | 后端 `npm test` **823/823 全绿（93 suites）**，含两处修复 spec（auth 2/2、weekly-report 10/10） |
| review | 0 open；两处均为测试维护，未改生产代码 |
| optimization | 0 open；零新增依赖；仅测试期望修正 |

## 原则
**不改生产逻辑去迁就测试**——保持契约真实。凡涉及「当前周 / 今天」的测试，日期不可写死常量，须动态算当前周或显式传固定 `weekStart`。
