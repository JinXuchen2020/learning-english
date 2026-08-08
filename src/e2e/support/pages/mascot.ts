// Page object for the AI-603 mascot growth card + story modal on the Home page.
// Key hooks (data-component):
//   MascotGrowthCard       — 等级环 + 进度条卡片（仅当 mascotLevel 已装载时渲染）
//   Mascot[data-level]     — 卡片内吉祥物，data-level 即当前等级（1..6）
//   ViewGrowthStoryBtn     — 「看成长故事」按钮
//   MascotStoryModal       — 成长剧情弹层（fixed overlay）
//   MascotStoryTitle/Text  — 弹层标题与正文
import { Page } from "@playwright/test";
import HomePage from "./home";

export default class MascotPage {
  private page: Page;
  private baseUrl: string;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  /** 确保 Home 已装载且 mascotLevel 数据已解析（growth card 出现即代表已装载）。 */
  async waitForGrowthCard(): Promise<void> {
    const home = new HomePage(this.page, this.baseUrl);
    await home.waitLoaded();
    await this.page
      .locator('[data-component="MascotGrowthCard"]')
      .first()
      .waitFor({ timeout: 15000 });
  }

  /** 成长卡片内吉祥物的 data-level（字符串 "1".."6"）。 */
  async growthCardLevel(): Promise<string | null> {
    const mascot = this.page
      .locator('[data-component="MascotGrowthCard"] [data-component="Mascot"]')
      .first();
    return mascot.getAttribute("data-level");
  }

  async clickViewStory(): Promise<void> {
    // 普通 <button onClick>，非 Next.js <Link>，不会触发客户端导航/节点卸载。
    await this.page
      .locator('[data-component="ViewGrowthStoryBtn"]')
      .first()
      .click();
  }

  async waitForStoryModal(): Promise<void> {
    await this.page
      .locator('[data-component="MascotStoryModal"]')
      .first()
      .waitFor({ timeout: 15000 });
  }

  async storyTitle(): Promise<string | undefined> {
    return (
      await this.page
        .locator('[data-component="MascotStoryTitle"]')
        .first()
        .textContent()
    )?.trim();
  }

  async storyText(): Promise<string | undefined> {
    return (
      await this.page
        .locator('[data-component="MascotStoryText"]')
        .first()
        .textContent()
    )?.trim();
  }
}
