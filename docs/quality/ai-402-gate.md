# AI-402 质量门报告

**Phase**: ai-402 · **Stack**: node-ts (NestJS 10 + TypeORM，better-sqlite3/postgres 双驱动)
**Date**: 2026-08-06 · **Branch**: feat/ai-402 (from feat/ai-401)

## 一句话结论
AI-402（TTS 集成）四道质量门 **全部 PASSED**，pre-commit 质量门强执放行，已提交（未 push）。本 feature 把 `BigModelProvider.synthesize` 从 AI-102 的降级桩替换为真实智谱 GLM-TTS 调用，使狐狸吉祥物获得**一致、可移植的儿童友好音色**（浏览器系统语音无法保证），为 AI-407 对话陪练页面的自动朗读奠定后端能力。

## 实施了什么
- **真实 TTS 调用**（`server/src/ai/bigmodel.provider.ts`）：
  - `POST {baseUrl}/audio/speech`，body：`{ model: 'glm-tts', input, voice, response_format: 'mp3', speed, volume: 1.0, stream: false }`
  - 默认音色 `tongtong`（智谱系统童声，贴合狐狸吉祥物儿童友好定位）；`voice` 参数可覆盖。
  - 响应解析双分支：① 二进制音频（`content-type` 非 json）→ `audioBase64` + `mimeFromContentType` 兜底 `audio/mpeg`；② JSON 信封 `{audio}`→`audioBase64` / `{url}`→`audioUrl`（兼容少数代理网关）。
  - 超时独立 `DEFAULT_TTS_TIMEOUT_MS=30_000`（`AbortSignal.timeout`），快于 LLM。
- **配置集中**（`ai-config.ts` + `ai.module.ts`）：
  - 新增 `BIGMODEL_TTS_MODEL`（默认 `glm-tts`）/ `BIGMODEL_TTS_VOICE`（默认 `tongtong`），经 `BigModelConfigView` 读取，经 `createAiProvider` 透传 `BigModelProvider`，符合 AI-105 单一配置入口约定。
  - `BigModelConfig` 新增 `ttsModel`/`ttsVoice` 注入字段，便于测试与 AI-103 动态装配。
- **mock 保留降级**：`MockAiProvider.synthesize` 仍返回空 `audioBase64`（浏览器 TTS 兜底），形状与接口一致。

## 四道质量门
| 门 | 结果 | 关键证据 |
|---|---|---|
| consistency | PASSED | `nest build` 0 错；`jest 464/464` 全绿（较 AI-401 的 454 +10）；纯后端 TTS 集成无 schema 变更，无 seed 建表需求；无全栈契约需对齐 |
| tests | PASSED | 单元：新增/改写 `bigmodel.provider.spec.ts` synthesize 真实路径 **11 case**（请求体校验/显式 voice 覆盖/二进制 mp3→audioBase64/JSON{url}→audioUrl/JSON{audio}→audioBase64/缺 audio+url→502/空二进制→502/缺 key→401/429→限流/超时→504/网络→0）+ `ai-config.spec.ts` 补 **2** 处 ttsModel/ttsVoice 断言；**BDD/E2E 0**——纯后端 TTS 集成，狐狸音色自动播放 UI 属 AI-407，按约束 #6「不为纯后端 API 写 BDD」豁免（非 legacy 豁免） |
| review | PASSED | 0 open；错误分类清晰（缺 key→401 access / 429→限流 / 空音频·结构异常→502 / 超时→504 / 网络→0 NETWORK，均带 `statusCode`/`code` 供 AI-106 识别）；接口忠实（`AudioResult` 形状）；配置集中（AI-105）；无裸 console、无 stub |
| optimization | PASSED | 0 open；原 degrade 桩已替换为真实实现（无 stub）；超时独立 30s；二进制一次性转 base64 无逐块冗余；音频内存返回与 AI-401 落库字段 `audioPath` 解耦 |

## 文档同步
- `features/backlog.md`：AI-402 状态 → **done**。
- `docs/ai-integration.md`：修正 `synthesize` 返回类型 `AudioStream` → `AudioResult`，并标注 AI-402 已落地（GLM-TTS / `tongtong` 音色）。

## 历史注记
- AI-307 报告曾标注「TTS deferred：AI-402 未落地，朗读用浏览器 Web Speech API」，现已由本 feature 落地后端狐狸音色能力，AI-407 接入时可平滑替换浏览器降级。

## 提交
- 分支 `feat/ai-402`，commit 未 push（按 feature-builder 规定仅 commit 不 push）。
- 链状态：`feat/ai-209 → … → feat/ai-309 → feat/ai-401 → feat/ai-402` 全部本地已提交未 push。

## 下一步
- backlog M4 下一个可独立交付项：**AI-403（对话陪练场景 Prompt 模板 + 内容安全双保险）** 或 **AI-407（/chat 前端页面 + 后端会话 API，含狐狸音色自动播放）**。AI-402 的 TTS 能力待 AI-407 落地消费。
