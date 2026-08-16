# AI-714 质量门报告：系统 Provider 兜底链 + Agnes AI 主用/智谱兜底种子

## 变更范围
- **seed.ts**：新增 `Agnes AI` 系统 provider（`openai-compatible`，baseURL `https://api.agnes-ai.cn/v1`，模型 `agnes-2.5-flash`，`chat_template_kwargs.enable_thinking=true`）作为 `isDefault` 主用；智谱 GLM 改为 `systemFallbackRank=1` 兜底（`isDefault=false`），并对历史 `isDefault` 智谱行做兼容 reconcile。两 key 经 `AGNES_API_KEY` / `ZHIPU_API_KEY` 环境变量注入，**未硬编码**。
- **provider-config.entity.ts**：新增 `systemFallbackRank`（int, nullable）与 `extraJson`（text, nullable）两列。
- **provider-config.dto.ts**：`CreateProviderConfigDto` / `UpdateProviderConfigDto` 新增可选 `extraBody: Record<string, unknown>`。
- **openai-compatible.provider.ts**：构造函数接收 `extraBody`，合并进 `chat()` 与 `chatWithImage()` 请求体。
- **provider-config.service.ts**：`create/update` 持久化 `extraJson`；新增 `resolveSystemChain()`（按 `[isDefault?-1 : systemFallbackRank ?? MAX]` 升序）；`buildProvider` 将 `extraJson` → `extraBody` 透传；新增 `parseExtra()`。
- **fallback-ai-provider.ts（新）**：`FallbackAiProvider` 对五个 AI 方法按 providers 顺序 `tryChain` 首成即返、全败抛末错。
- **ai.module.ts**：工厂改为 `resolveSystemChain → 逐 cfg buildProvider → new FallbackAiProvider → createAuditedProvider → AiProviderRouter`。

## 验证
- 后端 `tsc -p tsconfig.json --noEmit`：**0/0**
- 后端 jest（3 套件）：**32/32 全绿**
  - `openai-compatible.provider.spec.ts` — extraBody 合并进 chat body
  - `provider-config.service.spec.ts` — resolveSystemChain 排序 + buildProvider extraJson→extraBody
  - `fallback-ai-provider.spec.ts` — 主用成功跳过兜底 / 主用失败切兜底 / 全败抛末错 / 五方法均兜底

## 安全
- API key 仅经运行时环境变量注入，未写入源码或提交历史。
- 建议对已在对话中粘贴过的 `sk-2mPn…Zmb1` 做轮换（视为已暴露）。
