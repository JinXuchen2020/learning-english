# AI-405 质量门报告

> 配套 `.quality-gate.json`（flat 格式，pre-commit hook 已校验 `cleared:true` + 四 gate PASSED）

## 概述

AI-405 = **场景包注册表 + 枚举端点**。把 children English 陪练的 5 个场景（打招呼 / 动物园 / 买东西 / 天气 / 身体部位）集中为单一数据源 `chat-scenes.ts`，并通过 `GET /api/ai/chat/scenes` 供前端 `/chat` 页面枚举场景卡、起始语与目标词汇。

## 质量门

| 门 | 结果 | 依据 |
|---|---|---|
| consistency | PASSED | nest build 0 错；jest **515/515** 全绿（较 AI-404 的 501 +14）；无 DB schema 变更（纯新增静态注册表 + 只读枚举端点，无新实体 / 无迁移） |
| tests | PASSED | unit 515/515；新增 14 case（chat-scenes.service.spec 9 + chat.controller.spec scenes 2 + chat-message.dto.spec 1 未知 sceneId 兼容）；e2e/bdd 0（纯后端枚举豁免，约束 #6） |
| review | PASSED | 场景包单一数据源；GET 端点剥离 systemPrompt 不外泄；未知 sceneId 兼容自由对话；未越界 AI-406 |
| optimization | PASSED | SCENE_PACKAGES 常量数组 + 派生 map；SCENE_PROMPTS 改为从注册表派生消除文本漂移；枚举 O(1) 内存读取无 DB |

## 改动文件

- 新增 `server/src/chat/chat-scenes.ts` — 场景包注册表（5 场景，单一数据源）
- 新增 `server/src/chat/chat-scenes.service.ts` — Nest 注入 seam
- 改 `server/src/chat/chat.controller.ts` — 新增 `GET /api/ai/chat/scenes`
- 改 `server/src/chat/chat.module.ts` — 注册 `ChatScenesService`
- 改 `server/src/chat/chat-system-prompt.ts` — `SCENE_PROMPTS` / `buildChatSystemPrompt` 从注册表派生
- 测试：`chat-scenes.service.spec.ts`（新）、`chat.controller.spec.ts`（扩 scenes）、`chat-message.dto.spec.ts`（未知 sceneId 兼容）

## 契约

```
GET /api/ai/chat/scenes
→ [ { id, title, openingLine, targetVocabulary[] } ]   // 顺序即展示顺序; 不含 systemPrompt

已知场景 id: greeting | zoo | shopping | weather | body
未知/空 sceneId → buildChatSystemPrompt 不附加 framing（自由对话兼容 AI-403 contract）
```

## 越界声明

- 内容安全双保险（关键词黑名单 + LLM safety classifier）→ **AI-406**，本 feature 未实现。
- 前端 `/chat` 场景卡渲染 + TTS 自动播 → **AI-407**，本 feature 仅提供枚举端点契约。

## 提交

本地分支 `feat/ai-405`，`git commit` 不 push（skill 规则）。pre-commit hook 校验 `.quality-gate.json` flat 格式四门 PASSED 放行。
