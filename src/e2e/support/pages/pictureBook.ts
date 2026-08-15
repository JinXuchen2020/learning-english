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
   * /picture-book 是孤儿页（无导航入口），直接整页 goto。
   * JWT 已镜像到 localStorage，登录态保留；middleware 重定向到默认 locale 前缀。
   */
  async navigateToSection(): Promise<void> {
    await this.page.goto(`${this.baseUrl}/picture-book`);
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

  /**
   * Mock `GET /api/ai/picture-book/story` 使示例绘本在 e2e 中封闭（不依赖外部 AI）。
   * 返回含非空标题与多页的 PictureBook，确保阅读器弹窗（PictureBookModal）能确定性渲染。
   * 注意：示例绘本仅在用户点击「播放朗读」时才触发 tts 请求，弹窗本身只依赖本端点。
   */
  async mockStory(): Promise<void> {
    const body = {
      id: "book-sample",
      courseId: "",
      title: "The Little Fox",
      pages: [
        {
          pageNumber: 1,
          text: "Once upon a time, a little fox lived in the forest.",
          illustrationPrompt: "a little fox in a green forest",
        },
        {
          pageNumber: 2,
          text: "He made friends with a friendly rabbit.",
          illustrationPrompt: "a fox and a rabbit together",
        },
        {
          pageNumber: 3,
          text: "They played and laughed every single day.",
          illustrationPrompt: "a fox and a rabbit playing happily",
        },
      ],
      isDefault: false,
      createdAt: new Date().toISOString(),
    };
    await this.page.route("**/api/ai/picture-book/story**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      }),
    );
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
