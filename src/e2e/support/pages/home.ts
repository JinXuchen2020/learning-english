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
}
