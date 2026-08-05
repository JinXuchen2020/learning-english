# AI-105 质量报告 — 配置与密钥管理

- 分支：`feat/ai-105`（建在 `feat/ai-104` 之上）
- 栈：node-ts (NestJS 10)
- 质量门强执：`scripts/git-hooks/pre-commit` 已就位（`core.hooksPath=scripts/git-hooks`），提交时校验 `.quality-gate.json` 四门 PASSED + `cleared:true`。

## 一致性门（consistency）
- `npx tsc --noEmit -p tsconfig.json` → **0 错误**。
- `npx jest` → **27 suites / 137 tests 全绿**，无回归（含 AI-102/103/104 既有用例）。
- 全栈契约：无前端改动，无需契约对齐。

## 测试门（tests）
- **单元测试**（2 文件，16 用例全绿）：
  - `server/src/ai/ai-config.spec.ts`（7 用例）：缺省→`mock`+key 为 undefined+默认值；bigmodel 默认值/覆盖值；nvidia 完整读取；`AI_PROVIDER` 大小写+空格归一化；空串 key 视为 undefined。
  - `server/src/ai/ai.factory.spec.ts`（扩展 +9 用例，含既有回归）：`bigmodel` 缺 `BIGMODEL_API_KEY` → `logger.warn` 被调用且含 `BIGMODEL_API_KEY`；`bigmodel` 有 key → **不**告警；mock/nvidia/azure/未知/大小写 既有行为全部保持。
  - 覆盖率：`ai-config.ts` 100%（语句/分支/函数/行）；`ai.module.ts` 100% 语句。
- **BDD/E2E**：0 场景 —— 纯配置/启动期逻辑（无端点、无 UI），按硬约束 #6「不为纯后端 API 写 BDD」豁免；其效果（缺 key 告警、provider 切换）由消费方 feature 集成测试与本地启动验证覆盖。已在 `features/ai-105.md §6` 显式标注。

## 代码审查门（review）
- 空安全：缺失 key 经 `|| undefined` 归一，绝不抛错；`readAiConfig` 不依赖任何外部 IO。
- 错误处理：告警而非抛错，保持 AI-103「无 key 应用可启动」契约；真实失败仍发生在调用期（BigModelProvider 抛 `AiProviderException`）。
- 注入/安全：密钥**不进日志**（告警只提变量名 `BIGMODEL_API_KEY`，不打印 key 值）；不硬编码密钥。
- 类型契约：新增 `AiConfig`/`BigModelConfigView`/`NvidiaConfigView` 强类型；无 `any`。
- 死代码/魔法值：默认 baseUrl/model 提取为模块常量；无裸字面量散落。
- 一致性：沿用项目 `ConfigService` + `logger` 既有约定。
- 结论：**0 open**。

## 优化门（optimization）
- 配置读取单一来源（`readAiConfig`），消除 `createAiProvider` 内散落的 `config.get`。
- 无 stub 残留、无临时调试代码、无未用导出。
- 结论：**0 open**。

## 文档/边界
- `.gitignore` 已覆盖 `.env`（line 21），且 `!.env.example`（line 25）确保模板被跟踪 →「key 不进入 git」天然满足（已验证，未改动）。
- `.env.example` 已含 `AI_PROVIDER` 与 `NVIDIA_*` 全部变量（与 backlog 要求一致）→ 本 feature 不重复重写，仅集中读取 + 告警。
- 不越界：不引入新依赖（仅 `ConfigService`+`logger`）；不改 `AiProvider` 接口；不接重试/降级（AI-106）；不新建 provider 类。
