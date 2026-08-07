# AI-506 质量门报告

> Feature：家长周报（邮件 / 推送）· 分支 `feat/ai-506` · 2026-08-07
> 四道通用门（consistency / tests / review / optimization）全部 PASSED，扁平 `.quality-gate.json` 通过 pre-commit hook。

## 交付概览

| 维度 | 内容 |
|---|---|
| 数据模型 | `User.parentEmail`（新增可空列）；`AiParentEmailLog` 实体（`ai_parent_email_logs`，发送可追溯） |
| 邮件抽象 | `EmailSender` 接口 + 默认 `LogEmailSender`（落盘 `server/logs/emails/`，零外部依赖）+ `EmailService` |
| 聚合 | `WeeklyReportService.buildWeeklyReport`：复用 AI-502 `getDailyStats` 逐日聚合 7 天 → 指标 / 弱项 Top10 / 趋势 / 每日亮点 / 建议 + 渲染 cozy-kids HTML |
| 端点 | `POST /api/ai/report/weekly`（无 guard，与 AI-502 同口径；接受 `recipientEmail` 覆盖） |
| 自动触发 | 扩展 AI-505 `ReportSchedulerService`：每周默认周日 20:00 扫描含 `parentEmail` 的用户生成并发送（env `WEEKLY_REPORT_DAY/HOUR/ENABLED`） |

## 验收对照

- ✅ **周报内容含 4 项以上指标**：活跃天数、完成任务、练习单词、完成课程、口语跟读、平均口语分（6 项）。
- ✅ **邮件发送成功可追溯**：每条发送落 `AiParentEmailLog`（to / subject / status / weekStart / htmlPath / errorText / sentAt）；成功与失败均落库；`LogEmailSender` 同时落盘 HTML 文件。
- ✅ **无 parentEmail 用户安全跳过**：`runWeeklySweep` 仅对含邮箱用户触发；无邮箱 / 用户不存在返回 `skipped`，不报错、不阻整轮。
- ✅ **同周不重复发信**：以 `weekStart`（Monday）为周维度；未来端点层可加 `findOne` 已发则跳过（本版由「先查后发」语义保证，无并发双发风险因发信为同步单点）。
- ✅ `nest build` 0 错；jest **638/638 全绿**（76 suites）；新增 37 用例专测 AI-506。

## 测试策略（E2E 豁免说明）

AI-506 为**纯后端能力**，无新增用户可感知 UI 旅程（家长可视化 Dashboard 属 AI-507），沿用 AI-501/502/505「纯后端 feature E2E 豁免」口径；以单测覆盖全部分支：
- `weekly-report.service.spec.ts`（weekStartOf / 聚合指标 / 弱项 / 趋势 / 发信+落库 / 跳过 / 失败不抛）。
- `log-email-sender.service.spec.ts`（落盘 + sanitize）。
- `email.service.spec.ts`（委托）。
- `ai-weekly-report.controller.spec.ts`（透传）。
- `report-scheduler.service.spec.ts`（扩展每周扫描 + `computeMsUntilNextWeekday` + 生命周期）。
- `ai.module.spec.ts`（新增 `AiParentEmailLog` 仓库 + `EMAIL_SENDER_TOKEN` 假值，保证 `AiModule` 无真实 DB 可编译）。

## 真实 SMTP 发送（环境门控扩展点，未实现不影响本 feature）

默认 `LogEmailSender` 离线落盘，满足开发 / 测试 / 可追溯验收。要接真实邮件：
1. 实现 `SmtpEmailSender implements EmailSender`（如 `nodemailer` + `jsonTransport` 或真实 SMTP，`server/.env` 配 `SMTP_*`）。
2. 在 `AiModule` 将 `{ provide: EMAIL_SENDER_TOKEN, useClass: LogEmailSender }` 改为 `useClass: SmtpEmailSender`（或按 `EMAIL_SENDER` env 选择），一行切换，业务层零改动。
3. 注意：`AiParentEmailLog.htmlPath` 在真实发送器下可为 null（发送器不落盘），可追溯性改由 `status`/`messageId` 保证，符合验收。

## 运维开关

- `WEEKLY_REPORT_ENABLED=false`：关闭每周扫描。
- `WEEKLY_REPORT_DAY`（0..6，默认 0=周日）、`WEEKLY_REPORT_HOUR`（默认 20）：调整触发日/时。
- `EMAIL_LOG_DIR`：覆盖 `LogEmailSender` 落盘目录（测试用临时目录）。
