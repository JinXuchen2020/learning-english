// Page object for the AI-605 review reminder surface on the Home dashboard.
// Key hooks (data-component):
//   ReviewReminderCard   — 「今日复习」汇总卡（有到期词时出现）
//   ReviewWordLink       — 卡内每条到期词链接（→ /practice?focusWord=）
//   ReviewTaskLink       — 注入到「今日任务」列表中的复习项链接（data-review-word-id）
//   DailyTasks           — 当日任务列表根（含注入的复习项）
//   WordPractice         — 练习页根（点击复习词后的落地页）
import { Page } from "@playwright/test";

export default class ReviewPage {
  private page: Page;
  private baseUrl: string;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  /** 等待「今日复习」卡出现。 */
  async waitForReviewCard(): Promise<void> {
    await this.page
      .locator('[data-component="ReviewReminderCard"]')
      .first()
      .waitFor({ timeout: 15000 });
  }

  /** 卡内到期复习词链接数量。 */
  async reviewWordLinkCount(): Promise<number> {
    return this.page.locator('[data-component="ReviewWordLink"]').count();
  }

  /** 当日任务列表中注入的复习项数量。 */
  async reviewTaskInTasksCount(): Promise<number> {
    return this.page
      .locator('[data-component="DailyTasks"] [data-review-word-id]')
      .count();
  }

  /** 点击第一条到期复习词链接（Next.js <Link>，用 force 跳过卸载竞态）。 */
  async clickFirstReviewWord(): Promise<void> {
    const link = this.page
      .locator('[data-component="ReviewWordLink"]')
      .first();
    await link.click({ force: true });
    await this.page.waitForSelector('[data-component="WordPractice"]', {
      timeout: 15000,
    });
  }

  /** 断言已落到练习页且展示目标词（focusWord 参数 + 页面文本）。 */
  async practiceShowsWord(word: string): Promise<void> {
    const url = new URL(this.page.url());
    const focus = url.searchParams.get("focusWord");
    if (!focus || focus.toLowerCase() !== word.toLowerCase()) {
      throw new Error(
        `expected practice page focusWord="${word}", got "${focus}" (url=${this.page.url()})`,
      );
    }
    const body = (
      (await this.page
        .locator('[data-component="WordPractice"]')
        .textContent()) ?? ""
    ).toLowerCase();
    if (!body.includes(word.toLowerCase())) {
      throw new Error(`expected practice page to show word "${word}"`);
    }
  }
}
