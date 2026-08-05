// Page object for the plan wizard (src/app/plan/page.tsx).
// Key regions carry data-component hooks: PlanWizard / PlanTitle / PlanForm /
// PlanLoading / PlanPreview / PlanWeekCard. Selector chips use
// button[data-field=...][data-value=...] so steps can target by semantic value.
import { Locator, Page } from "@playwright/test";

export default class PlanPage {
  private page: Page;
  private baseUrl: string;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  async open(): Promise<void> {
    // Navigate via the TabNav "Plan" link (client-side) so the in-memory auth
    // token survives. A full page.goto('/plan') would reset module memory and
    // bounce to /login via AuthGate, so the wizard never mounts.
    const planLink = this.page.locator('nav a[href="/plan"]');
    if (await planLink.count()) {
      await planLink.first().click();
    } else {
      await this.page.goto(`${this.baseUrl}/plan`);
    }
    await this.page.waitForSelector('[data-component="PlanWizard"]');
  }

  async headingText(): Promise<string | undefined> {
    return (await this.page.locator('[data-component="PlanTitle"]').textContent())?.trim();
  }

  async ageRangeCount(): Promise<number> {
    return this.page.locator('button[data-field="ageRange"]').count();
  }

  async levelCount(): Promise<number> {
    return this.page.locator('button[data-field="level"]').count();
  }

  async dailyMinuteCount(): Promise<number> {
    return this.page.locator('button[data-field="dailyMinutes"]').count();
  }

  async interestCount(): Promise<number> {
    return this.page.locator('button[data-field="interests"]').count();
  }

  async weekCount(): Promise<number> {
    return this.page.locator('button[data-field="weeks"]').count();
  }

  async selectAgeRange(value: string): Promise<void> {
    await this.page.locator(`button[data-field="ageRange"][data-value="${value}"]`).click();
  }

  async selectLevel(value: string): Promise<void> {
    await this.page.locator(`button[data-field="level"][data-value="${value}"]`).click();
  }

  async selectDailyMinutes(value: string): Promise<void> {
    await this.page.locator(`button[data-field="dailyMinutes"][data-value="${value}"]`).click();
  }

  async toggleInterest(value: string): Promise<void> {
    await this.page.locator(`button[data-field="interests"][data-value="${value}"]`).click();
  }

  async selectWeeks(value: string): Promise<void> {
    await this.page.locator(`button[data-field="weeks"][data-value="${value}"]`).click();
  }

  async isGenerateDisabled(): Promise<boolean> {
    return this.page.locator('button[data-action="generate"]').isDisabled();
  }

  async clickGenerate(): Promise<void> {
    await this.page.locator('button[data-action="generate"]').click();
  }

  async waitPreview(): Promise<void> {
    await this.page.waitForSelector('[data-component="PlanPreview"]', { timeout: 30000 });
  }

  async previewWeekCount(): Promise<number> {
    return this.page.locator('[data-component="PlanWeekCard"]').count();
  }
}
