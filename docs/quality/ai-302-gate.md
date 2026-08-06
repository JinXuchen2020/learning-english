# AI-302 质量门报告

> 栈: node-ts (Next.js 14 + React + Vitest) | 分支: feat/ai-302 | 基于 feat/ai-301
> 强执: pre-commit hook (`core.hooksPath=scripts/git-hooks`)；`cleared: true`

## 实现摘要

- **纯逻辑层 `src/lib/speech-recorder.ts`**（Vitest node 环境可测，浏览器 API 全部注入/守卫）：
  - `classifyRecordingError` — 从 `DOMException.name`/`message`/code 归类为 5 种 `RecordingErrorKind`。
  - `pickMimeType(detector)` — webm/opus 优先，iOS Safari 降级 audio/mp4；探测函数注入可测。
  - `clampDuration` — 录音时长钳制（默认 10s 上限由 `DEFAULT_MAX_DURATION_MS`）。
  - `buildRecordingResult` — 装配 `{blob,mimeType,url,size,durationMs}`，`createObjectURL` 注入、失败降级空串不抛。
  - `isSecureContextForMedia` — 安全上下文预判（https/localhost）。
- **展示层 `src/components/SpeechRecorder.tsx`**（`'use client'`）：
  - 状态机 `idle/requesting/recording/recorded/error`，根元素 `data-component="SpeechRecorder"` + `data-status`（E2E 钩子约定，与 `TabNav` 一致）。
  - `getUserMedia` → `MediaRecorder`（按 `pickMimeType` 选 mimeType）→ 录制；到达 `maxDurationMs` 自动 `stop()`；手动 Stop 立即停。
  - 权限引导 + 分级友好错误文案（权限拒绝提示去浏览器设置开启）；`isIosFallback` 时标注 audio/mp4。
  - `busyRef` 防重复启动；`reset` 与卸载 cleanup 均 `revokeObjectURL` 防泄漏；日志走 `logger`（无裸 console）；复用 `Button`/`cn` 设计系统。

## 四道质量门结论

| 门 | 结论 |
| --- | --- |
| consistency | **PASSED** — 前端 `tsc --noEmit` 0 错误；`vitest run` 全绿 4 files/46 tests（含 AI-302 新 17 case）；组件经 TS 编译无类型错误。项目未配置 ESLint（`next lint` 未强执，与仓库现状一致，不作为缺口。 |
| tests | **PASSED** — 单元测试 `lib/speech-recorder.spec.ts` 17 case 全覆盖 5 个纯函数全分支；BDD/E2E 0（纯展示型组件无独立路由/旅程，与 AI-301 纯后端豁免同口径，设计文档显式标注；组件 `data-component`/`data-status` 已就位供 AI-307 `/speech` E2E 覆盖）。 |
| review | **PASSED (0 open)** — 空安全（getUserMedia/MediaRecorder 不存在→not-supported 预判、navigator 守卫）；错误分类全分支；权限引导友好；iOS 降级 + 格式标注；双启动防护；URL 释放防泄漏；时长上限 + timer/interval 清理；无裸 console；设计系统复用。 |
| optimization | **PASSED (0 open)** — 无 stub/占位；纯函数导出供单测直覆且注入式可测；浏览器 API 一律守卫无 SSR 崩溃；无临时调试残留。 |

## 测试证据

- `npx vitest run` → `Test Files 4 passed (4)`，`Tests 46 passed (46)`（AI-302 新增 17）。
- `npx tsc --noEmit -p tsconfig.json` → 0 错误。
- 单测分支覆盖：
  - `classifyRecordingError`：NotAllowed/Security→permission-denied；NotFound→no-microphone；NotSupported→not-supported；message 含 permission/microphone 兜底；code 0→permission-denied；普通 Error/null/undefined→unknown。
  - `pickMimeType`：webm/opus 优先（isIosFallback:false）；仅 mp4→audio/mp4（isIosFallback:true）；全不支持→空串。
  - `clampDuration`：负/NaN→0；>cap→cap；=cap→cap；<cap→原值。
  - `isSecureContextForMedia`：无 window→false；true/false 反射。
  - `buildRecordingResult`：注入 createObjectURL→url/size/durationMs 正确；失败降级空串不抛；负 durationMs→0。

## E2E 处置（重要）

AI-302 是**可复用展示型组件**，不新增页面路由（路由在 AI-307 `/speech` 落地），因此无独立用户旅程，
按本项目 **AI-301 实体-first + 组件展示型** 同口径，BDD/E2E **豁免**（设计文档 §6 显式标注）。
组件已挂 `data-component="SpeechRecorder"` 与 `data-status`，待 AI-307 把本组件嵌入 `/speech` 页后，
由该页的「听→录→评→反馈→得星」BDD/E2E 经 client-side 导航覆盖权限引导 / 录制态 / 错误提示。

## 遗留风险 / 下一步

- 本组件仅采集，不评测/不落库/不接 API（属 AI-303 接收 audio / AI-305 评测 / AI-306 反馈 / AI-307 页面）。
- 下一步 M3：AI-303 `POST /api/ai/speech/evaluate`（multer 接收本组件产出的 audio + wordId/sentenceId）。
- 与 AI-301（`ai_speech_attempts` 实体）衔接：AI-306 把本组件录音经评测后分数与弱音素落库。
