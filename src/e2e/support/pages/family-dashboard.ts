// Page object for the AI-712 family dashboard + child progress detail.
// Data hooks (all language-agnostic, matched by data-component / data-*):
//   [data-component="FamilyDashboard"]        总览根容器
//     [data-component="DashboardGrid"]        卡片网格
//       [data-component="DashboardChildCard"] 单卡（data-child-id）
//         [data-component="DashboardChildLink"] 下钻链接（Next <Link>，须 force click）
//     [data-component="DashboardEmpty"]       无孩子空态
//   Child detail (/parent/children/:id):
//     [data-component="ChildProgressDetail"]  详情根容器
//       [data-component="BackToDashboard"]    返回总览
//       [data-component="WeakWordsSection"] / [data-component="WeakWordItem"][data-weak-word=...] / [data-component="WeakWordsEmpty"]
//       [data-component="SkillMasterySection"]
//       [data-component="WeeklyTrendSection"] / [data-component="TrendBar"][data-stars=...] (7 根)
import { Page } from "@playwright/test";

// CSS.escape 仅浏览器全局；本 page object 跑在 Node，拼选择器用兜底。
function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export default class FamilyDashboardPage {
  private page: Page;
  private baseUrl: string;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  /**
   * 打开家长「概览」页（/parent，含家庭总览）。家长注册后默认重定向到此页；
   * 显式 goto 兜底（middleware 重定向到默认 locale 前缀）。等待 FamilyDashboard
   * 渲染（异步拉取后）作为「已进入」判定。
   */
  async open(timeout = 15000): Promise<void> {
    await this.page.goto(`${this.baseUrl}/parent`);
    await this.waitForFamilyDashboard(timeout);
  }

  /** 等待家庭总览根容器出现。 */
  async waitForFamilyDashboard(timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      () => !!document.querySelector('[data-component="FamilyDashboard"]'),
      undefined,
      { timeout },
    );
  }

  /** 等待指定 childId 的卡片出现在网格。 */
  async waitForCardById(childId: string, timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (id: string) =>
        !!document.querySelector(
          `[data-component="DashboardChildCard"][data-child-id="${CSS.escape(id)}"]`,
        ),
      childId,
      { timeout },
    );
  }

  /**
   * 点开指定 childId 的卡片进入详情。Next <Link> 弱项下钻会卸载本页，
   * 普通 click 等「稳定」会超时报 detached → 用 force:true。
   */
  async openCard(childId: string): Promise<void> {
    const link = this.page.locator(
      `[data-component="DashboardChildCard"][data-child-id="${cssEscape(childId)}"] [data-component="DashboardChildLink"]`,
    );
    await link.click({ force: true });
    await this.page.waitForFunction(
      () => !!document.querySelector('[data-component="ChildProgressDetail"]'),
      undefined,
      { timeout: 15000 },
    );
  }

  /** 返回总览（点详情页返回按钮，客户端路由回 /parent）。 */
  async clickBackToDashboard(): Promise<void> {
    await this.page
      .locator('[data-component="BackToDashboard"]')
      .click();
    await this.waitForFamilyDashboard();
  }

  /** 详情页已渲染，且其标题含指定昵称（语言无关：纯文本 includes）。 */
  async assertDetailForChild(nickname: string, timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (nick: string) => {
        const el = document.querySelector('[data-component="ChildProgressDetail"]');
        if (!el) return false;
        return (el.textContent || "").includes(nick);
      },
      nickname,
      { timeout },
    );
  }

  async waitForWeakWordsSection(timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      () => !!document.querySelector('[data-component="WeakWordsSection"]'),
      undefined,
      { timeout },
    );
  }

  async waitForSkillMasterySection(timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      () => !!document.querySelector('[data-component="SkillMasterySection"]'),
      undefined,
      { timeout },
    );
  }

  /** 等待指定数量的周趋势柱（设计约定恒为 7）。 */
  async waitForWeeklyTrendBars(count: number, timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (n: number) =>
        document.querySelectorAll('[data-component="TrendBar"]').length === n,
      count,
      { timeout },
    );
  }

  async waitForWeakWordItems(min: number, timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (m: number) =>
        document.querySelectorAll('[data-component="WeakWordItem"]').length >= m,
      min,
      { timeout },
    );
  }

  async waitForWeakWordItem(word: string, timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (w: string) =>
        !!document.querySelector(
          `[data-component="WeakWordItem"][data-weak-word="${CSS.escape(w)}"]`,
        ),
      word,
      { timeout },
    );
  }

  async waitForWeakWordsEmpty(timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      () => !!document.querySelector('[data-component="WeakWordsEmpty"]'),
      undefined,
      { timeout },
    );
  }

  /** 读取指定 childId 卡片展示的星星数（语言无关：解析 ★ 后的整数）。 */
  async getCardStars(childId: string): Promise<number> {
    return this.page.evaluate((id: string) => {
      const card = document.querySelector(
        `[data-component="DashboardChildCard"][data-child-id="${id}"]`,
      );
      if (!card) return -1;
      const m = (card.textContent || "").match(/★\s*(\d+)/);
      return m ? Number(m[1]) : -1;
    }, childId);
  }
}
