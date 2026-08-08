# AI-606 质量门报告 — 拍照学单词 (OCR)

- **Phase**: ai-606
- **Stack**: node-ts (NestJS 10 + Next.js 14)
- **分支**: `feat/ai-606`（从 `feat/ai-605` 派生，未直连 master，未 push）
- **报告时间**: 2026-08-09

## 四道质量门

| 门 | 结论 | 证据 |
|---|---|---|
| consistency | ✅ PASSED | 后端 `tsc` 0 错；后端 `jest` 33 PASS；前端 `vitest` 100 PASS；`next build` 0 错（14 路由含 `/scan`）；全栈 `ScanCard`/`ScanResult`/`ConfirmScanDto` 字段名/类型/可空对齐 |
| tests | ✅ PASSED | 单元测试 3 文件：`scan-agent.spec`（解析各分支）、`scan.service.spec`（识别/兜底/confirm 越权/list）、`scan.controller.spec`（路由+上传校验 413/415/400）；`mock-ai.provider.spec` OCR 夹具扩展；BDD/E2E `photo-word.feature` 1 scenario / 7 steps 全绿 |
| review | ✅ PASSED（0 open） | userId 取自 JWT `req.user.userId`（非客户端可控）；`confirm`/`list` 严格按 userId 过滤，跨用户 id 静默忽略；上传 5MB 上限 + MIME 白名单（png/jpeg/webp）→ 413/415；OCR 解析失败/空 → `recognized:false` + 友好文案（不抛 500）；无图片 base64 泄露日志 |
| optimization | ✅ PASSED（0 open） | 常量提取 `MAX_IMAGE_BYTES`/`ALLOWED_IMAGE_MIME`/`HARD_UPLOAD_LIMIT_BYTES`；无 stub/占位/临时调试；复用 `postFormData` 多部件上传；429 退避复用 AI-106 `RetryableAiProvider`，本 feature 不重复实现 |

## 实现摘要

- **后端**：`ScannedWord` 实体（表 `scanned_words`，个人生词本，不复用 `words`/`ai_word_cards`）；
  `scan-agent.ts`（`parseScanOutput` 剥离围栏 + 结构校验 + 最小校验 word+meaning）；
  `scan.service.ts`（`recognize` 落库 pending / `confirm` 置 saved / `listSaved`）；
  `scan.controller.ts`（`POST /api/scan/recognize` multer 上传 + `POST /api/scan/confirm` + `GET /api/scan`，JwtAuthGuard）；
  `ScanModule` 注册于 `AppModule`，实体注册于 `appEntities`（`synchronize` 自动建表）。
- **前端**：`/scan` 页（上传→识别→卡片预览→「全部加入生词本」/单卡加入→生词本列表）；
  `TabNav` 新增「拍照」入口；`api.ts` 增 `recognizeImage`/`confirmScanWords`/`listScannedWords`；
  `types.ts` 增 `ScanCard`/`ScanResult`/`ConfirmScanDto`。
- **MockProvider**：`chatWithImage` 在 OCR 关键词（识别/拍照/物体…）下返回确定性 JSON 卡片夹具，E2E 免 key 可跑。

## 验证命令（复现）

```bash
# 后端
cd server && "/c/Program Files/nodejs/node.exe" ./node_modules/typescript/lib/tsc.js -p tsconfig.json --incremental false
cd server && "/c/Program Files/nodejs/node.exe" ./node_modules/jest/bin/jest.js --testPathPattern "(scan|mock-ai)" --runInBand

# 前端
cd src && "/c/Program Files/nodejs/node.exe" ./node_modules/vitest/vitest.mjs run
cd src && "/c/Program Files/nodejs/node.exe" ./node_modules/next/dist/bin/next build

# E2E（需起服：AI_PROVIDER=mock 后端 :4000 + next start 前端 :3000）
cd src && "/c/Program Files/nodejs/node.exe" ./node_modules/@cucumber/cucumber/bin/cucumber.js --config e2e/cucumber.photo-word.js
```

## 遗留风险

- 真实 `glm-4.6v-flash` 免费模型频繁 429（AI-106 退避已覆盖），但极限限流下识别仍可能失败 → 前端已用「识别不出」友好兜底，不阻断。
- 生词本仅存文本（wordText/meaning/example/imagePrompt），未接文生图渲染；配图 prompt 已落库，后续可接 image-gen。
