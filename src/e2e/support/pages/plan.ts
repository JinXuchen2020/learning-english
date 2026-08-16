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
    // /plan 已移入「更多」抽屉，无 TabNav 直链；直接整页 goto。
    // JWT 已镜像到 localStorage，整页 goto 保留登录态（middleware 重定向到默认 locale 前缀）。
    await this.page.goto(`${this.baseUrl}/plan`);
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

  /**
   * Mock `POST /api/ai/plan/generate` 使计划向导在 e2e 中封闭（不依赖外部 AI，
   * 与 chat/speech/report 的 mock 约定一致）。返回一份结构合法的多周计划，确保
   * PlanPreview / PlanWeekCard / PlanDayCard 以及 apply / toggle-day 按钮都能确定性渲染。
   */
  async mockGeneratePlan(): Promise<void> {
    const body = {
      plan: {
        weeks: [
          {
            week: 1,
            theme: "Animals",
            days: [
              {
                day: 1,
                skillType: "vocab",
                title: "Meet the Animals",
                lessons: [
                  {
                    type: "main",
                    title: "Cat and Dog",
                    skillType: "vocab",
                    description: "Learn pet words",
                  },
                ],
              },
              {
                day: 2,
                skillType: "listen",
                title: "Listen and Repeat",
                lessons: [
                  {
                    type: "speaking",
                    title: "Speak the Sounds",
                    skillType: "speak",
                  },
                ],
              },
            ],
          },
        ],
      },
      model: "mock-plan",
      degraded: false,
    };
    await this.page.route("**/api/ai/plan/generate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      }),
    );
  }

  async previewWeekCount(): Promise<number> {
    return this.page.locator('[data-component="PlanWeekCard"]').count();
  }

  async planDayCardCount(): Promise<number> {
    return this.page.locator('[data-component="PlanDayCard"]').count();
  }

  async isApplyVisible(): Promise<boolean> {
    const btn = this.page.locator('button[data-action="apply"]');
    return (await btn.count()) > 0 && (await btn.first().isVisible());
  }

  async isRegenerateVisible(): Promise<boolean> {
    const btn = this.page.locator('button[data-action="regenerate"]');
    return (await btn.count()) > 0 && (await btn.first().isVisible());
  }

  async clickApply(): Promise<void> {
    await this.page.locator('button[data-action="apply"]').click();
  }

  async waitAppliedSuccess(): Promise<void> {
    await this.page.waitForSelector('[data-component="PlanAppliedSuccess"]', { timeout: 30000 });
  }

  async toggleDay(index: number): Promise<void> {
    await this.page.locator(`button[data-action="toggle-day"][data-day-index="${index}"]`).click();
  }

  async isDayDone(index: number): Promise<boolean> {
    const pressed = await this.page
      .locator(`button[data-action="toggle-day"][data-day-index="${index}"]`)
      .getAttribute("aria-pressed");
    return pressed === "true";
  }

  /** After applying, wait until we land back on Home with its daily tasks rendered. */
  async waitHomeWithTasks(): Promise<void> {
    // 接受任意 locale 前缀（/zh、/zh/、/en、/en/），与语言无关。
    await this.page.waitForFunction(
      () => /^\/(zh|en)(\/|$)/.test(location.pathname),
      undefined,
      { timeout: 30000 },
    );
    await this.page.waitForSelector('[data-component="Home"]');
    await this.page.waitForFunction(
      () => document.querySelectorAll('[data-component="DailyTasks"] button').length >= 1,
      undefined,
      { timeout: 30000 }
    );
  }
}
