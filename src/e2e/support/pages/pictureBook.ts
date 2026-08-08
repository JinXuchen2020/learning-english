// Page object for the AI-604 picture book page + reader modal.
// Key hooks (data-component):
//   PictureBookSection       — 绘本馆页面根（含示例卡片 + 课程选择器）
//   ViewSampleBookBtn        — 「读示例绘本」按钮（普通 <button>，非 Link）
//   PictureBookModal         — 阅读器弹层（fixed overlay）
//   PictureBookTitle         — 弹层标题
//   PictureBookPage          — 单页（data-page-number）
//   PictureBookPageText      — 单页叙事文本
import { Page } from "@playwright/test";

export default class PictureBookPage {
  private page: Page;
  private baseUrl: string;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  /**
   * 经 TabNav 客户端导航到 /picture-book（保留 SPA auth，避免整页跳转清空 token）。
   * 点击 Next.js <Link> 触发路由切换可能让旧节点卸载 → 用 force:true 跳过稳定性检查。
   */
  async navigateToSection(): Promise<void> {
    const tab = this.page.locator('a[href="/picture-book"]').first();
    await tab.click({ force: true });
    await this.waitForSection();
  }

  async waitForSection(): Promise<void> {
    await this.page
      .locator('[data-component="PictureBookSection"]')
      .first()
      .waitFor({ timeout: 15000 });
  }

  async clickViewSample(): Promise<void> {
    await this.page
      .locator('[data-component="ViewSampleBookBtn"]')
      .first()
      .click();
  }

  async waitForModal(): Promise<void> {
    await this.page
      .locator('[data-component="PictureBookModal"]')
      .first()
      .waitFor({ timeout: 15000 });
  }

  async bookTitle(): Promise<string | undefined> {
    return (
      await this.page
        .locator('[data-component="PictureBookTitle"]')
        .first()
        .textContent()
    )?.trim();
  }

  async pageCount(): Promise<number> {
    return this.page.locator('[data-component="PictureBookPage"]').count();
  }

  async firstPageText(): Promise<string | undefined> {
    return (
      await this.page
        .locator('[data-component="PictureBookPageText"]')
        .first()
        .textContent()
    )?.trim();
  }
}
