# Fox English 设计系统（cozy-kids · v2）

> 面向 5–10 岁儿童的英语学习 App。温暖、自然、圆润、陪伴感。
> 本文件是**全站视觉与组件的单一事实来源（single source of truth）**，所有页面必须基于本文的 token 与组件原语构建，避免风格碎片化。
> 升级日期：2026-08-12 ｜ UI Designer

---

## 1. 设计哲学

- **儿童优先，陪伴感第一**：小狐狸 Foxy 全程在场，用表情（happy / thinking / celebrating / encouraging）给即时情绪反馈。
- **大、圆、软**：所有可触控元素最小 56px，圆角统一（控制件 50px 胶囊、卡片 24px），柔和投影、无硬边框、tactile 按压回弹。
- **温暖自然色**：奶油底 + 青绿主色 + 阳光黄点缀，低饱和、高亲和。
- **响应式优先**：一套设计从手机（竖屏）到平板（横屏）再到桌面自适应，不单独出"手机版/平板版"。
- **可访问性内建**：WCAG AA 对比度、键盘焦点环、`prefers-reduced-motion`、44px+ 触控目标，默认就做对。

---

## 2. 设计 Token

### 2.1 颜色（语义角色）

| 角色 | Token | 值 | 用途 |
|---|---|---|---|
| 背景 | `--seed-bg` | `#F8F8F0` | 页面底色（奶油） |
| 表面 | `--seed-surface` | `#F7F3DF` | 卡片渐变起点 |
| 卡片面 | `kids-card` | `#F7F3DF` | Card 默认底面 |
| 次表面 | `kids-secondary` | `#F0E8D8` | 列表行 / 胶囊底 |
| 主色 | `--seed-primary` / `kids.mint` | `#19C8B9` | 主按钮、链接、进度环 |
| 主色 hover | `kids.mint-hover` | `#3DD4C6` | |
| 主色 active | `kids.mint-active` | `#11A89B` | |
| 主色 wash | `kids.mint-wash` | `#E6F9F6` | 完成态底色 |
| 强调 | `--seed-accent` / `kids.sun` | `#FFCC00` | 星星、焦点环、强调按钮 |
| 成功 | `--color-success` / `kids.leaf` | `#6FBA2C` | 正确反馈、完成勾 |
| 警示 | `kids.warning` | `#F5C31C` | |
| 危险 | `kids.danger` | `#E05A5A` | 错误、删除确认 |
| 标题文字 | `kids.title` | `#794F27` | h1–h3、卡标题 |
| 正文 | `kids.text` | `#725D42` | 段落 |
| 次要文字 | `kids.muted` | `#9F927D` | 辅助说明 |
| 禁用 | `kids.disabled` | `#C4B89E` | |

> 多色板（紫/蓝/橙/粉/青）用于课程图标、场景标签等分类强调，**不用于正文**，保证可读性。

### 2.2 字体（Nunito，圆体）

- 全站统一 `Nunito`（next/font 加载，权重 400–900）。
- **流式字号**：根字号 `clamp(15px, 4.2vw, 18px)`；标题用 `clamp()` 随视口缩放，宽屏封顶、窄屏收缩，杜绝横向溢出。
- 层级：h1 `clamp(1.5rem→2rem)`、h2 `clamp(1.25rem→1.5rem)`、h3 `clamp(1.05rem→1.15rem)`、正文 `1rem`、小字 `0.875rem`。
- 字重：标题 800，卡标题/按钮 700，正文 500。

### 2.3 间距（8pt 基数，流式）

`--space-unit: 8px` → xs 4 / sm 8 / md 16 / lg 24 / xl 32 / 2xl 48。
区块纵向节奏用 `.stack-y`（移动 24px → 平板+ 32px）。
容器内边距：手机 20px → 桌面 32px（见 `.container-kids` / layout 响应式 max-width）。

### 2.4 圆角与投影

- 控制件 `rounded-control` = 50px（胶囊）；卡片 `rounded-panel` = 24px；小卡 `rounded-card` = 20px。
- 投影：`shadow-card`（静态）/ `shadow-card-hover`（悬浮上浮）；按钮 tactile 用实体下阴影 `0 5px 0`（非模糊，触感更"实"）。

### 2.5 动效

- `bounce`（吉祥物待机轻跳）、`pulse-green`/`pulse-ring`/`pulse-sun`（正确/等级/奖励反馈）、`shake`（错误）、`star-pop`（得星）、`fade-in`（入场）。
- **全部尊重 `prefers-reduced-motion`**：该模式下动效近乎关闭。

---

## 3. 响应式断点（移动优先）

| 断点 | 视口 | 典型设备 | 布局要点 |
|---|---|---|---|
| 默认 | <640px | 手机竖屏 | 单列；底栏 TabNav；容器 20px 内边距 |
| `sm` | ≥640px | 大手机/小平板 | 课程卡 2 列 |
| `md` | ≥768px | 平板竖屏 | 每日任务 3 列 |
| `lg` | ≥1024px | 平板横屏 | 容器放大到 `max-w-6xl`；课程卡 4 列 |
| `xl` | ≥1280px | 桌面 | 容器 `max-w-7xl`（1280px） |
| `2xl` | ≥1536px | 大桌面 | 容器 1408px |

主容器在 `src/app/[locale]/layout.tsx`：
`mx-auto w-full max-w-5xl px-5 sm:px-6 lg:max-w-6xl xl:max-w-7xl`。

---

## 4. 组件原语库（`src/components/ui/`）

所有原语基于 `kids-*` token + `cva` 变体 + `cn()` 合并 + `forwardRef`，零业务耦合，可直接复用。

| 组件 | 文件 | 变体 / 关键属性 | 用途 |
|---|---|---|---|
| **Button** | `button.tsx` | `variant: default(主)/success/secondary/soft`；`size: default(56)/sm(44)/lg(64)` | 主行动按钮（tactile） |
| **Card** | `card.tsx` | `interactive`、`padding: none/sm/default/lg` | **统一卡片**，取代手写 `.card-kids` |
| **Badge** | `badge.tsx` | `variant: neutral/primary/sun/success/danger/outline`；`size: sm/md` | 标签 / 计数胶囊（弱项词、完成数） |
| **ProgressRing** | `progress-ring.tsx` | `progress(0–100)`、`size`、`color`、`label` | 环形进度（可访问 `role="img"`） |
| **Progress** | `progress.tsx` | `value`/`max`/`indicatorClassName` | 线性进度条 |
| **LevelRing** | `../LevelRing.tsx` | `totalStars`/`size` | 等级环（星星驱动，复用于奖励页） |
| **SectionTitle** | `section-title.tsx` | `title`/`count`/`icon` | 区块标题 + 可选计数胶囊 |
| **Input** | `input.tsx` | `size`/`invalid`；配套 `Field`（label+hint+error） | 表单输入，焦点环一致 |
| **Select** | `select.tsx` | `value`/`options`/`onChange`/`size`/`invalid` | 自定义下拉选择，与 Input 同款触觉风格，支持键盘导航 |
| **Mascot** | `../Mascot.tsx` | `expression`/`size`/`level` | 小狐狸吉祥物（多表情+等级配饰） |
| **TabNav** | `../TabNav.tsx` | child 5 tab（含"更多"抽屉）/ parent 3 tab | 全局底栏，安全区适配 |

### 用法示例

```tsx
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionTitle } from "@/components/ui/section-title";
import { ProgressRing } from "@/components/ui/progress-ring";

<SectionTitle title={t("myCourses")} />
<Card data-component="PlanProgress" className="flex items-center gap-5">
  <ProgressRing progress={72} color="#10B981" />
  <div>
    <h2 className="font-bold text-kids-title">{t("planProgressTitle")}</h2>
  </div>
</Card>
<div className="flex flex-wrap gap-2">
  {weakWords.map((w) => <Badge key={w}>{w}</Badge>)}
</div>
```

> **规则**：新页面禁止再手写 `className="card-kids ..."` 或内联 SVG 进度环，必须引用上述原语。老页面按迭代逐步迁移（见 §6）。

---

## 5. 可访问性（WCAG AA）

- **对比度**：正文 `#725D42` on `#F8F8F0` ≈ 7:1；主色按钮白字 `#19C8B9`/白 ≈ 2.5:1（大号粗体按钮，符合 3:1 大文本/UI 组件阈值）。重点文字用 `kids.title` 保证正常文本 4.5:1。
- **键盘**：全局 `:focus-visible` 焦点环（阳光黄 3px，offset 2px）；所有交互元素可用 Tab 抵达，`aria-pressed`/`aria-current`/`aria-expanded` 到位。
- **读屏**：进度环 `role="img"+aria-label`；错误 `role="alert"`；图标按钮带 `aria-label`。
- **触控**：最小 56px（按钮）/ 64px（TabNav），满足儿童手指与 44px 规范。
- **动效敏感**：`prefers-reduced-motion` 下关闭动画。
- **E2E 契约**：每个关键节点保留稳定的 `data-component` 与 `data-*` 属性（如 `data-task-id`、`data-review-word-id`），**禁止依赖随 locale 变化的文案做断言**。

---

## 6. 迁移与落地指引

本次升级已在 **首页（Home）** 完成示范：所有区块改用 `Card`/`Badge`/`SectionTitle`/`ProgressRing`，逻辑与 `data-component` 完全保留。其余路由按以下顺序逐步迁移，每页迁移后跑通对应 BDD/E2E：

> ✅ **迁移状态（2026-08-12 完成）**：首页 + `login`/`parent`（feature 轮次）+ 其余 10 路由（`course`/`practice`/`rewards`/`plan`/`scan`/`chat`/`word-cards`/`speech`/`picture-book`/`parent-report`）已全部迁到 `Card` 原语，全站 `card-kids` 手写类残留归零，`data-component` E2E 契约计数逐页守恒。

1. **高流量门面**：`/course`、`/practice`、`/rewards` —— 直接套用 `Card` + `SectionTitle`。
2. **表单页**：`/plan`、`/login`、`/parent`、`/scan` —— 输入框统一换 `Input` + `Field`，错误态用 `invalid`。
3. **抽屉/二级页**：`/chat`、`/word-cards`、`/speech`、`/picture-book` —— 卡片网格复用 `Card`。
4. **家长视角**：`/parent-report`（含 `TrendChart`）保持图表独立性，仅外壳套 `container-kids`。

> 迁移原则：**只换壳、不改逻辑、不丢 `data-component`**。每完成一页，本地 `next build` + 对应 E2E 必须绿。

---

## 7. 质量门（交付校验）

- `next build` 通过、TS strict 0 错误。
- 320 / 375 / 390px 视口 `scrollWidth ≤ innerWidth`（无横向溢出）。
- 全站 `data-component` 断言在 BDD/E2E 中稳定通过。
- 色板与组件 95%+ 一致（无散落硬编码色值）。
