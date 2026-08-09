// Page object for the home dashboard (src/app/page.tsx, wrapped by AuthGate).
// Key regions carry data-component hooks: Home / GreetingBanner / DailyTasks / CourseProgress.
import { Locator, Page } from "@playwright/test";
import SpeechPage from "./speech";

export default class HomePage {
  private page: Page;
  private baseUrl: string;
  private speakingTaskId: string | null = null;

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
    // Counts all task cards (button + speech deep-link), not just <button>.
    return this.page.locator('[data-component="DailyTasks"] [data-task-id]').count();
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

  /** Navigate to Home via the TabNav (client-side) so the in-memory auth token survives. */
  async openDashboard(): Promise<void> {
    const path = await this.page.evaluate(() => location.pathname);
    if (path !== "/") {
      const homeLink = this.page.locator('nav a[href="/"]');
      if (await homeLink.count()) {
        await homeLink.first().click();
      }
    }
    await this.waitLoaded();
  }

  /** AI-605：客户端导航「弹跳」回 Home（先走其它 TabNav 路由再回 "/"），
   *  强制 Home 重新挂载并重新拉取数据（播种到期复习词后刷新复习卡用）。
   *  注意：token 仅存在于模块内存，绝不能整页刷新（page.reload 会清空登录态）。 */
  async bounceToHome(): Promise<void> {
    const away = this.page.locator('nav a[href="/practice"]');
    if (await away.count()) {
      await away.first().click({ force: true });
      await this.page.waitForSelector(
        '[data-component="WordPractice"], [data-component="PracticeEmpty"]',
        { timeout: 15000 },
      );
    }
    const home = this.page.locator('nav a[href="/"]');
    if (await home.count()) {
      await home.first().click({ force: true });
    }
    await this.waitLoaded();
  }

  /** Click the speaking (mic) task card, which deep-links to /speech?taskId=... (AI-308).
   *  Returns the captured taskId (also storable on the shared World for the
   *  cross-step completion assertion). */
  async clickSpeakingTask(): Promise<string | null> {
    const link = this.page.locator('[data-component="DailyTasks"] [data-speech-link="true"]');
    if ((await link.count()) === 0) {
      throw new Error("No speaking (mic) task link found on Home");
    }
    await link.click();
    // Capture taskId from the post-navigation speech URL. Next.js <Link> href is
    // not reliably readable via getAttribute() in Playwright (returns null), but
    // the client-side-navigated URL always carries ?taskId=, which is what the
    // speech page reads too — so this is the source of truth.
    await this.page.waitForSelector('[data-component="SpeechPage"]', { timeout: 15000 });
    const url = new URL(this.page.url());
    this.speakingTaskId = url.searchParams.get("taskId");
    return this.speakingTaskId;
  }

  /** Whether the speaking task (id provided, or captured earlier) is now marked completed. */
  async isSpeakingTaskCompleted(taskId?: string | null): Promise<boolean> {
    const id = taskId ?? this.speakingTaskId;
    if (!id) return false;
    const card = this.page.locator(
      `[data-component="DailyTasks"] [data-task-id="${id}"]`,
    );
    if ((await card.count()) === 0) return false;
    const pressed = await card.getAttribute("aria-pressed");
    return pressed === "true";
  }

  /** Tap the first non-speaking (headphones/pencil) task to complete it directly. */
  async tapFirstNonSpeakingTask(): Promise<void> {
    const cards = this.page.locator('[data-component="DailyTasks"] [data-task-id]');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const href = await card.getAttribute("href");
      const disabled = await card.getAttribute("disabled");
      if (href && href.includes("/speech")) continue; // skip speaking links
      if (disabled !== null) continue; // skip already-completed
      await card.click();
      await this.page.waitForFunction(
        (idx) => {
          const el = document.querySelectorAll('[data-component="DailyTasks"] [data-task-id]')[idx];
          return el && el.getAttribute("disabled") !== null;
        },
        i,
        { timeout: 10000 },
      );
      return;
    }
  }

  /** 完成 Home 上所有每日任务（含口语深链任务）。 */
  async completeAllTasks(): Promise<void> {
    const speech = new SpeechPage(this.page, this.baseUrl);
    for (let guard = 0; guard < 30; guard++) {
      const cards = this.page.locator('[data-component="DailyTasks"] [data-task-id]');
      const count = await cards.count();
      let acted = false;
      for (let i = 0; i < count; i++) {
        const card = cards.nth(i);
        const disabled = await card.getAttribute("disabled");
        if (disabled !== null) continue; // 已完成则跳过
        const href = await card.getAttribute("href");
        if (href && href.includes("/speech")) {
          // 口语任务 → 客户端导航进 /speech，完成会话后返回 Home（AI-308）。
          await card.click();
          await this.page.waitForSelector('[data-component="SpeechPage"]', { timeout: 15000 });
          await speech.completeSession();
          const back = this.page.locator('[data-component="SpeechComplete"] a[href="/"]');
          if (await back.count()) await back.first().click();
          await this.waitLoaded();
          acted = true;
          break;
        }
        await card.click();
        await this.page.waitForFunction(
          (idx) => {
            const el = document.querySelectorAll('[data-component="DailyTasks"] [data-task-id]')[idx];
            return el && el.getAttribute("disabled") !== null;
          },
          i,
          { timeout: 10000 },
        );
        acted = true;
        break;
      }
      if (!acted) break;
    }
  }

  /* ----------------------- AI-504：今日 AI 小结卡片 ----------------------- */

  /** Mock `POST /api/ai/report/daily` 返回一份（默认/AI）报告。
   *  通配 `**` 以兼容 query 串（避免 E2E page.route 精准匹配漏网）。 */
  async mockDailyReport(summary: string, weakWordsCsv: string): Promise<void> {
    const weakWords = weakWordsCsv
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean);
    await this.page.route("**/api/ai/report/daily**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "test-user",
          date: "2026-08-07",
          summaryText: summary,
          weakWords,
          suggestionText: "明天再接再厉！",
          isDefault: weakWordsCsv.trim() === "",
          mascotExpr: "cheer",
        }),
      }),
    );
  }

  /** Mock 报告端点：持续 500 直到 `enableReportSuccess()` 被调用（用于验证「生成今日小结」重试）。
   *  用显式开关而非「首次 500 后续 200」，以兼容 React StrictMode 在 dev 下双调用 effect
   *  （否则第二次调用已返回 200，生成按钮瞬间被成功卡覆盖，断言永远等不到按钮）。
   *  开关挂在共享的 `this.page` 上（各 step new 的 HomePage 都引用同一个 world.page），
   *  使点击 step 里的 `enableReportSuccess()` 能真正翻转路由行为。 */
  async mockDailyReportFailThenSuccess(summary: string): Promise<void> {
    (this.page as unknown as { __reportFail?: boolean; __reportSummary?: string }).__reportFail = true;
    (this.page as unknown as { __reportFail?: boolean; __reportSummary?: string }).__reportSummary = summary;
    await this.page.route("**/api/ai/report/daily**", (route) => {
      const store = this.page as unknown as { __reportFail?: boolean; __reportSummary?: string };
      if (store.__reportFail) {
        return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "test-user",
          date: "2026-08-07",
          summaryText: store.__reportSummary ?? summary,
          weakWords: [],
          suggestionText: "重试成功！",
          isDefault: true,
          mascotExpr: "encourage",
        }),
      });
    });
  }

  /** 翻转报告端点为成功态（点击「生成今日小结」前调用）。 */
  async enableReportSuccess(): Promise<void> {
    (this.page as unknown as { __reportFail?: boolean }).__reportFail = false;
  }

  async reportCardVisible(): Promise<boolean> {
    return (await this.page.locator('[data-component="AiReportCard"]').count()) > 0;
  }

  async reportSummaryText(): Promise<string | undefined> {
    await this.page
      .locator('[data-component="AiReportSummary"]')
      .first()
      .waitFor({ timeout: 10000 });
    return (await this.page.locator('[data-component="AiReportSummary"]').first().textContent())?.trim();
  }

  async reportWeakWordsText(): Promise<string | undefined> {
    await this.page
      .locator('[data-component="AiReportWeakWords"]')
      .first()
      .waitFor({ timeout: 10000 });
    return (await this.page.locator('[data-component="AiReportWeakWords"]').first().textContent())?.trim();
  }

  async expandReport(): Promise<void> {
    await this.page.locator('[data-component="AiReportToggle"]').first().click();
    await this.page
      .locator('[data-component="AiReportDetails"]')
      .first()
      .waitFor({ timeout: 10000 });
  }

  async reportDetailsText(): Promise<string | undefined> {
    return (await this.page.locator('[data-component="AiReportDetails"]').first().textContent())?.trim();
  }

  async generateButtonVisible(): Promise<boolean> {
    const btn = this.page.locator('[data-component="AiReportGenerateBtn"]').first();
    await btn.waitFor({ timeout: 10000 });
    return (await btn.count()) > 0;
  }

  async clickGenerate(): Promise<void> {
    await this.page.locator('[data-component="AiReportGenerateBtn"]').first().click();
  }
}
