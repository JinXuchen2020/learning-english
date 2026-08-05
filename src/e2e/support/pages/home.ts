// Page object for the home dashboard (src/app/page.tsx, wrapped by AuthGate).
// Key regions carry data-component hooks: Home / GreetingBanner / DailyTasks / CourseProgress.
import { Locator, Page } from "@playwright/test";

export default class HomePage {
  private page: Page;
  private baseUrl: string;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  // Wait until the dashboard is mounted AND its data (courses) has loaded,
  // so assertions don't race the initial loading spinner.
  async waitLoaded(): Promise<void> {
    await this.page.waitForSelector('[data-component="Home"]');
    await this.page.waitForSelector('[data-component="CourseProgress"] a');
  }

  async greetingText(): Promise<string | undefined> {
    return (await this.page.locator('[data-component="GreetingBanner"]').textContent())?.trim();
  }

  async courseCount(): Promise<number> {
    return this.page.locator('[data-component="CourseProgress"] a').count();
  }

  async taskCount(): Promise<number> {
    return this.page.locator('[data-component="DailyTasks"] button').count();
  }

  async completedCountText(): Promise<string | undefined> {
    return (await this.page.locator('[data-component="DailyTasks"] h2 span').first().textContent())?.trim();
  }

  async clickFirstCourse(): Promise<void> {
    await this.page.locator('[data-component="CourseProgress"] a').first().click();
  }

  async completeFirstTask(): Promise<void> {
    const btn: Locator = this.page.locator('[data-component="DailyTasks"] button').first();
    await btn.click();
    // Optimistic UI flips aria-pressed immediately; wait for it.
    await this.page.waitForFunction(() => {
      const el = document.querySelector('[data-component="DailyTasks"] button');
      return el && el.getAttribute("aria-pressed") === "true";
    });
  }

  async isFirstTaskCompleted(): Promise<boolean> {
    const pressed = await this.page
      .locator('[data-component="DailyTasks"] button')
      .first()
      .getAttribute("aria-pressed");
    return pressed === "true";
  }

  // AI-209：计划完成度卡（data-component="PlanProgress"）。仅在存在 applied 计划时出现。
  async planProgressVisible(): Promise<boolean> {
    return (await this.page.locator('[data-component="PlanProgress"]').count()) > 0;
  }

  async planProgressText(): Promise<string | undefined> {
    return (await this.page.locator('[data-component="PlanProgress"]').textContent())?.trim();
  }

  /** 解析「已完成 X/Y 天」中的 X（已完成天数）。 */
  async planDoneDays(): Promise<number> {
    const text = await this.planProgressText();
    const match = text?.match(/已完成\s*(\d+)\s*\/\s*\d+\s*天/);
    if (!match) throw new Error(`无法从计划完成度文本解析已完成天数: "${text}"`);
    return Number(match[1]);
  }

  /** 完成 Home 上所有每日任务（逐个点击并等待其 aria-pressed=true）。 */
  async completeAllTasks(): Promise<void> {
    const buttons = this.page.locator('[data-component="DailyTasks"] button');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const disabled = await btn.getAttribute("disabled");
      if (disabled !== null) continue; // 已完成/禁用则跳过
      await btn.click();
      await this.page.waitForFunction(
        (idx) => {
          const el = document.querySelectorAll('[data-component="DailyTasks"] button')[idx];
          return el && el.getAttribute("aria-pressed") === "true";
        },
        i,
      );
    }
  }
}
