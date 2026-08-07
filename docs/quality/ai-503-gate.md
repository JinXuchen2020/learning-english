# AI-503 质量门报告

> 阶段：M5「AI 错题与进度报告」· 质量门 Phase 4 产出
> 提交：feat/ai-503（基于 feat/ai-502）· 未 push
> 质量门格式：扁平四键（consistency / tests / review / optimization 均为 `PASSED ...` 字符串），满足 pre-commit hook 强执约定

## 交付内容

| 文件 | 作用 |
|---|---|
| `server/src/ai/report-agent.ts` | **AI-503 主交付**：重写 `REPORT_AGENT_SYSTEM_PROMPT`（儿童友好/绝不批评/弱项必须取自 `weakWordCandidates` 禁编造/`mascotExpr` 决策规则）；文件头注释更新为「AI-503 精炼完成」 |
| `server/src/ai/ai-report.service.ts` | `DailyReportStats` 增 `weakWordCandidates`；`getDailyStats` 聚合当日低正确率真实单词（WordProgress attempts/correctCount + word.text，阈值 <0.6、去重、上限 5）；`callReportAgent` 随统计一并喂给模型 |
| `server/src/ai/report-agent.spec.ts` | **新增**：提示安全红线断言 + 解析鲁棒性 11 case |
| `server/src/ai/ai-report.service.spec.ts` | 更新：新增候选推导 2 case + 无 word 关联安全跳过 + 有活动断言 chat 消息含 `weakWordCandidates` |

## 四道质量门

| 门 | 结果 | 关键证据 |
|---|---|---|
| consistency | **PASSED** | `nest build` 0 错误；`jest` **299/299** 全绿；`npm run seed` 不抛 |
| tests | **PASSED** | 单元 14 新增 case（report-agent 11 + service 3）；BDD/E2E 0（纯后端提示精炼豁免，已在 `features/ai-503.md` 标注） |
| review | **PASSED** | 0 open；儿童安全红线具象化进 prompt；weakWords 约束为候选子集保证「弱项来自真实错题」；mascotExpr 规则明确；空安全；不新增接口 |
| optimization | **PASSED** | 0 open；候选聚合复用既有 wordRows 查询（仅加 `relations:['word']`）；上限 5 去重防 token 膨胀 |

## 关键洞察（设计决策）

AI-502 的 `callReportAgent` 只把**聚合计数**（`DailyReportStats`）喂给模型，里面**没有具体单词**。没有单词数据，模型无法「从真实错题」产出 `weakWords`，只能编造——直接违反 backlog 验收。

AI-503 在**不新增端点**前提下，于 service 层聚合真实弱项候选 `weakWordCandidates`（当日 `WordProgress` 正确率 <0.6 的 `word.text`，去重上限 5），随统计一并传给模型；prompt 强制 `weakWords` 必须是其子集。这样验收才真正可满足，且未改动 `POST /api/ai/report/daily` 契约。

> 注：口语弱音素（`AiSpeechAttempt.weakPhonemes`）属音素级、非单词级，本轮不纳入单词候选（避免音素→单词臆测），其影响已由 `avgSpeechScore` 在小结中体现。

## 验收对照（来自 backlog）

- [x] 输出通过 JSON 校验（`parseReportAgentOutput` 鲁棒解析：去 code fence、截取 `{`…`}`、字段兜底、mascotExpr 非法退 `encourage`；单测覆盖）
- [x] 弱项列表来自真实错题（`weakWordCandidates` 真实聚合 + prompt 强制子集、禁编造）
- [x] 语气鼓励、不批评（prompt 安全红线：禁止「笨/差/恐吓/比较」，错误用「再试一次」「我们一起练」）

## 偏离设计之处

- 相比 AI-502 草案：除提示精炼外，额外做了 service 层 `weakWordCandidates` 真实聚合（payload 增强）。原因如上——否则「弱项来自真实错题」验收无法在仅有计数的前提下成立。属同 feature 交付，不新增接口、不改 API 契约。
