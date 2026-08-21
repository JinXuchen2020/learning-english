# 🦊 小狐狸学英语 (Fox English)

面向儿童的英语启蒙学习应用：孩子通过和小狐狸（Foxy）对话、闯关练习、听读绘本、拍照识词、跟读评测等方式沉浸式学英语；家长端可查看学习进度并配置 AI 服务商。

- 前端：**Next.js 14 (App Router) + next-intl + Tailwind CSS**，cozy-kids 设计系统
- 后端：**NestJS + TypeORM**，SQLite（开发）/ PostgreSQL（生产）无缝切换
- 多语言：`zh`（默认）、`en`

---

## ✨ 功能概览

| 模块 | 说明 |
| --- | --- |
| 聊天 Chat | 与小狐狸多轮对话练口语，含内容安全过滤 |
| 课程 Course | 结构化课程与闯关 |
| 练习 Practice | 分题型练习 |
| 奖励 Rewards | 积分 / 徽章体系，孩子攒分 → 家长端审批兑换 |
| 绘本 Picture Book | 绘本听读 |
| 拍照 Scan | 拍照识词 / OCR |
| 跟读 Speech | 语音跟读与发音评测 |
| 单词卡 Word Cards | 单词记忆卡 |
| 家长面板 Parent | 学习进度总览、AI Provider 配置（按家庭归属） |

---

## 🧱 技术栈

| 层 | 技术 |
| --- | --- |
| 前端框架 | Next.js 14 (App Router) + React 18 |
| 国际化 | next-intl (`zh` / `en`) |
| 样式 | Tailwind CSS + cozy-kids 设计 token（见 `docs/design-system.md`） |
| 后端框架 | NestJS 10 + TypeORM 0.3 |
| 数据库 | better-sqlite3（开发）/ PostgreSQL（生产） |
| 鉴权 | JWT（`role: child | parent`） |
| AI 接入 | 可插拔 Provider（OpenAI 兼容 / Mock），按家长账号归属 |

---

## 📦 仓库结构

本仓库为**双包结构**，没有根 `package.json`，需分别安装与运行：

```
learning-english/
├── server/                 # NestJS 后端（端口 4000）
│   ├── src/
│   │   ├── ai/             # AI provider 路由、provider-config 模块
│   │   ├── auth/           # 注册/登录/JWT
│   │   ├── parent/         # 家长面板（仅验登录 JWT role）
│   │   ├── chat/ plan/ ... # 业务模块
│   │   └── entities/       # TypeORM 实体（User 等）
│   └── .env.example        # 环境变量模板
├── src/                    # Next.js 前端（端口 3000）
│   ├── app/[locale]/       # 多语言路由页面
│   ├── components/ui/      # cozy-kids 组件原语（Card/Badge/Input/Select…）
│   ├── e2e/                # Cucumber + Playwright 端到端测试
│   └── messages/           # zh / en 文案
├── docs/                   # 设计系统、AI 接入、质量门等文档
├── features/               # feature spec + backlog 路线图
└── scripts/git-hooks/      # 质量门 pre-commit 强执
```

---

## 🚀 快速开始

### 前置要求
- **Node.js 20+**（推荐 22）
- 包管理器：npm

### 1. 安装依赖

```bash
# 后端
cd server && npm install

# 前端（新终端）
cd src && npm install
```

### 2. 配置环境变量

```bash
# 后端：复制模板后按需修改
cd server && cp .env.example .env
```

开发零配置建议把 AI 设为 Mock（无需真实 key）：

```bash
# server/.env
AI_PROVIDER=mock
DB_TYPE=sqlite
JWT_SECRET=dev-secret-change-me
```

### 3. 初始化数据库

```bash
cd server && npm run seed
```

### 4. 启动

```bash
# 终端 A：后端（先启动，端口 4000）
cd server && npm run start:dev

# 终端 B：前端（端口 3000，127.0.0.1）
cd src && npm run dev
```

打开 http://127.0.0.1:3000/zh 。

---

## ⚙️ 环境变量（后端 `server/.env`）

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `DB_TYPE` | `sqlite` / `postgres` | `sqlite` |
| `SQLITE_PATH` | SQLite 文件路径（sqlite 模式） | `dev.sqlite` |
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` | PostgreSQL 连接（postgres 模式） | — |
| `DB_SYNCHRONIZE` | 启动时按实体同步表结构（开发用） | `true` |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | JWT 签名与有效期 | `7d` |
| `PORT` | 后端监听端口 | `4000` |
| `AGNES_API_KEY` | seed 阶段用于加密落库「系统默认主用 provider」（Agnes AI, openai-compatible）；运行期不读 env | 见 `.env.example` |
| `PROVIDER_ENC_KEY` | AES-256-GCM 密钥，加密 provider apiKey 落库；seed 与运行期必须一致 | 见 `.env.example` |
| `AI_DAILY_CALL_LIMIT` / `AI_DAILY_TOKEN_LIMIT` | 每用户每日调用/Token 配额 | `200` / `100000` |
| `AI_COURSE_TIMEOUT_MS` | 课程生成单次 AI 调用超时（默认 18s × 最多 3 次 < Vercel 60s；本地慢模型如 Agnes 建议设 `150000`） | `18000` |

> 运行期 AI 调用一律走数据库中的系统 provider 配置（seed 加密落库），不再从 env 读取端点/模型。家长还可在 **家长面板 → AI Provider 配置** 中为每个家庭运行时配置 OpenAI 兼容服务商；孩子账号自动继承其所属家长的默认 Provider。

---

## 🎨 设计系统

全站视觉与组件的单一事实来源见 **[`docs/design-system.md`](docs/design-system.md)**：

- 组件原语位于 `src/components/ui/`：`Card` `Badge` `Input` `ProgressRing` `SectionTitle` `Select` `Button` `Progress`
- 设计 token 双轨：CSS 变量（`src/app/globals.css`）与 Tailwind 主题（`src/tailwind.config.ts`）需同步修改
- 新页面禁止手写 `card-kids` 类或内联 SVG 进度环，必须引用上述原语，并保持 `data-component` 契约稳定（供 E2E 断言）

---

## 🧪 脚本

### 后端 (`server/`)

| 命令 | 说明 |
| --- | --- |
| `npm run start:dev` | 开发模式启动（watch） |
| `npm run seed` | 种子数据 |
| `npm test` | 单元测试（Jest） |
| `npm run build` | 构建 |

### 前端 (`src/`)

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发服务器（:3000） |
| `npm run build` / `npm start` | 生产构建 / 启动 |
| `npm run e2e` | 端到端测试（Cucumber + Playwright） |
| `npm run typecheck:e2e` | 仅类型检查 E2E 套件 |
| `npm run test:unit` | 前端单元测试（Vitest） |

---

## ✅ 测试与质量门

- **后端单测**：`cd server && npm test`（Jest，覆盖 services/controllers/providers/工具函数）
- **端到端**：`cd src && npm run e2e`（Cucumber + Playwright，断言基于 `data-component` 与稳定 token，语言无关）
- **质量门 pre-commit**：本仓库通过 `core.hookspath=scripts/git-hooks` 安装了强执 hook。**任何源码改动提交时，必须同时将更新后的 `.quality-gate.json`（四道门 `consistency / tests / review / optimization` 全 `PASSED` 且 `cleared:true`）一并暂存**，否则提交被拦截。

---

## 🚀 部署到 Vercel（前后端）

本仓库为双包结构，在 Vercel 上建**两个项目**，均连接同一 GitHub 仓库、但设置不同的 **Root Directory**：

### 项目 A — 前端（Next.js）
- Root Directory：`src/`
- Framework Preset：自动识别为 Next.js，无需额外配置
- 环境变量：`NEXT_PUBLIC_API_URL` = 后端项目地址，例如 `https://fox-english-api.vercel.app/api`
- i18n / middleware（next-intl）原生支持，无需静态导出

### 项目 B — 后端（NestJS Serverless）
- Root Directory：`server/`
- `server/vercel.json` 已配置：`buildCommand: npm run build`（先编译出 `dist/`）→ 由 `server/api/index.ts` 暴露为 Serverless Function → 所有路径 rewrite 到该函数
- 环境变量（必填）：
  - `DB_TYPE=postgres` 及 `DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_DATABASE`（Vercel 文件系统只读，**不能用 SQLite**；推荐 Neon / Supabase / Vercel Postgres）
  - `FRONTEND_ORIGIN` = 前端项目域名，例如 `https://fox-english.vercel.app`（CORS 白名单，逗号分隔可多个）
  - `JWT_SECRET`、`AI_PROVIDER` 等沿用 `server/.env.example`
  - `LOG_DIR=/tmp/logs`、`EMAIL_LOG_DIR=/tmp/emails`（Vercel 只读 FS，日志须写到 `/tmp`）
- 数据库初始化：本地用 `DB_TYPE=postgres DB_*=... npm run seed` 对 Postgres 跑一次种子；Vercel 构建不处理数据

### 注意事项
- NestJS 经 `dist/vercel-entry.js`（由 `npm run build` 预编译）导入，**规避** Vercel esbuild 丢弃装饰器元数据导致 DI 失败的问题。
- Serverless 有冷启动与 60s 超时（`vercel.json` 已设 `maxDuration: 60`）。
- 推送 `master` 后两个项目各自自动部署。

---

## 🗺️ 路线图

里程碑与 feature 路线图见 **[`features/backlog.md`](features/backlog.md)**。近期（M8）规划：

- **AI-710** 家庭绑定：家长注册 / 创建并认领孩子账号 / 孩子自动继承家长 Provider
- **AI-711** 每孩独立 Provider 覆盖（可选）
- **AI-712** 家长仪表盘：多孩子学习进度总览

> 公开注册仅限家长账号；孩子账号唯一创建入口为受 `ParentGuard` 保护的家长端接口。

---

## 📄 许可证

内部学习项目，暂无公开许可证。
