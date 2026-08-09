// Page object for the AI-704 makeup queue surface on the Home dashboard.
// Key hooks (data-component):
//   MakeupCard        — 「补学小任务」汇总卡（有昨日弱词或未完成计划日时出现）
//   MakeupWordLink    — 卡内每条昨日弱词链接（→ /practice?focusWord=）
//   MakeupMissedTask  — 卡内每条昨日未完成计划日（含「标记完成」按钮）
//   MakeupCompleteBtn — 标记完成按钮（data-makeup-plan-day-id）
//   WordPractice      — 练习页根（点击弱词后的落地页）
import { Page } from "@playwright/test";

export default class MakeupPage {
  private page: Page;
  private baseUrl: string;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  /** 等待「补学小任务」卡出现。 */
  async waitForMakeupCard(): Promise<void> {
    await this.page
      .locator('[data-component="MakeupCard"]')
      .first()
      .waitFor({ timeout: 15000 });
  }

  /** 卡内昨日弱词链接数量。 */
  async weakWordLinkCount(): Promise<number> {
    return this.page.locator('[data-component="MakeupWordLink"]').count();
  }

  /** 卡内昨日未完成计划日数量。 */
  async missedTaskCount(): Promise<number> {
    return this.page.locator('[data-component="MakeupMissedTask"]').count();
  }

  /** 点击第一条昨日弱词链接（Next.js <Link>，用 force 跳过卸载竞态）。 */
  async clickFirstWeakWord(): Promise<void> {
    const link = this.page.locator('[data-component="MakeupWordLink"]').first();
    await link.click({ force: true });
    await this.page.waitForSelector('[data-component="WordPractice"]', {
      timeout: 15000,
    });
  }

  /** 点击第一条未完成计划日的「标记完成」按钮。 */
  async clickFirstComplete(): Promise<void> {
    const btn = this.page
      .locator('[data-component="MakeupCompleteBtn"]')
      .first();
    await btn.click({ force: true });
  }

  /** 等待所有未完成计划日从卡中消失（标记完成写入回写）。 */
  async waitMissedTasksGone(): Promise<void> {
    await this.page
      .locator('[data-component="MakeupMissedTask"]')
      .first()
      .waitFor({ state: "detached", timeout: 15000 });
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
