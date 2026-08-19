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
    // 计数在 SectionTitle 的 Badge（第二个 <span>）里；遍历 h2 下所有 span 取含 X/Y 的那个，
    // 避免用 .first() 误抓标题 span。
    return this.page.evaluate(() => {
      const spans = document.querySelectorAll('[data-component="DailyTasks"] h2 span');
      for (const span of Array.from(spans)) {
        if (/(\d+)\s*\/\s*(\d+)/.test(span.textContent || "")) {
          return (span.textContent || "").trim();
        }
      }
      return undefined;
    });
  }

  async clickFirstCourse(): Promise<void> {
    await this.page.locator('[data-component="CourseProgress"] a').first().click();
  }

  /** 按标题点击课程卡（hasText 精确到卡片，避免 AI-801 生成的同名/近似课程干扰）。 */
  async clickCourseNamed(title: string): Promise<void> {
    await this.page
      .locator('[data-component="CourseProgress"] a', { hasText: title })
      .first()
      .click();
  }

  async completeFirstTask(): Promise<void> {
    const btn: Locator = this.page.locator('[data-component="DailyTasks"] button').first();
    await btn.click();
    // Optimistic UI flips aria-pressed immediately; wait for it.
    await this.page.waitForFunction(() => {
      const el = document.querySelector('[data-component="DailyTasks"] button');
      return el && el.getAttribute("aria-pressed") === "true";
    });
    // 乐观 UI 翻牌后，后端 completeTask 仍可能在途。等「我的奖励」卡
    // （setProgress 在 API 落库后回写 progress.pointsBalance）积分 >=1，
    // 确认服务侧已入账，避免下一跳 /rewards 的 getProgress 抢跑读到 0
    // （AI-701/702 E2E 竞态：rewards 页仅挂载时拉一次进度）。
    await this.page.waitForFunction(
      () => {
        const el = document.querySelector('[data-component="RewardsHomeCard"]');
        if (!el) return false;
        // 文案随语言变化（zh「已有 N 积分可兑换」/ en「You have N points」），
        // 仅抽取其中的数字，判定积分已 >=1（服务侧已入账）。
        const m = (el.textContent || "").match(/\d+/);
        return m ? Number(m[0]) >= 1 : false;
      },
      undefined,
      { timeout: 15000 },
    );
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

  /** 解析「已完成 X/Y」中的 X（已完成天数）。文案随语言变化，仅抽取数值。 */
  async planDoneDays(): Promise<number> {
    const text = await this.planProgressText();
    const match = text?.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) throw new Error(`无法从计划完成度文本解析已完成天数: "${text}"`);
    return Number(match[1]);
  }

  /** Navigate to Home. JWT is mirrored to localStorage, so a full page.goto
   *  preserves the login state (middleware redirects bare "/" to the default
   *  locale prefix). This is locale-agnostic and avoids stale TabNav hrefs. */
  async openDashboard(): Promise<void> {
    await this.page.goto(`${this.baseUrl}/`);
    await this.waitLoaded();
  }

  /** AI-605：强制 Home 重新挂载并重新拉取数据（播种到期复习词后刷新复习卡用）。
   *  JWT 已镜像到 localStorage，整页 goto 保留登录态，且必定触发 Home 重挂载。 */
  async bounceToHome(): Promise<void> {
    await this.page.goto(`${this.baseUrl}/`);
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
    // AI-209 / CI 兜底：计划每日任务含 speaking 任务（plan-template REVIEW_SLOTS），
    // 完成它们会驱动一次真实 POST /api/ai/speech/evaluate。CI 无法访问云端 provider，
    // 若该端点未 mock，completeSession() 的 waitFeedback 会卡到 20s+（叠加等待
    // SpeechPage 的 15s）直接击穿 30s step 超时。此处封闭该端点为确定性「通过」，
    // 确保「完成全部」这一通用 helper 在任意场景下都不依赖真实 AI（与 memory 中
    // 「AI 端点 e2e 封闭 mock」约定一致；若场景已自行 mock，后注册的覆盖前者）。
    await this.page.route("**/api/ai/speech/evaluate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          score: 95,
          readableText: "ok",
          weakPhonemes: [],
          feedback: "Great job!",
          mascotExpr: "cheer",
          passed: true,
          level: "good",
        }),
      }),
    );
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
          // 整页 goto 回 Home（token 在 localStorage，登录态保留；
          // SpeechComplete 的返回链接 href 带 locale 前缀，直接 goto 最稳）。
          await this.page.goto(`${this.baseUrl}/`);
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

  /* ----------------------- AI-803：计划节引用任务 Home 深链 ----------------------- */

  /**
   * 封闭 `GET /tasks/daily` 返回一条带真实 lessonId 的每日任务（skillType 决定深链去向：
   * vocab/listen/write → /practice?lessonId=；speak → /speech?taskId=）。用于在 e2e 中
   * 确定性地验证 Home 渲染 LessonTaskLink（不依赖后端 applyPlan 写回时序）。
   */
  async mockDailyTasksWithLesson(
    skillType: string,
    lessonId = "lesson-abc",
    title = "Meet the Cat",
    taskId = "lesson-task-1",
  ): Promise<void> {
    await this.page.route("**/tasks/daily", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: taskId,
            title,
            description: title,
            icon: "pencil",
            completed: false,
            lessonId,
            skillType,
            source: "plan",
          },
        ]),
      }),
    );
  }

  /** 统计 Home 上 LessonTaskLink（data-component=LessonTaskLink）数量（AI-803 深链卡）。 */
  async lessonDeepLinkCount(): Promise<number> {
    return this.page.locator('[data-component="LessonTaskLink"]').count();
  }

  /** 点击首个 LessonTaskLink，客户端导航到 /practice?lessonId= 或 /speech?taskId=（依 skillType）。 */
  async clickFirstLessonLink(): Promise<void> {
    const link = this.page.locator('[data-component="LessonTaskLink"]').first();
    if ((await link.count()) === 0) {
      throw new Error("No LessonTaskLink found on Home");
    }
    await link.click();
    await this.page.waitForFunction(
      () => /^\/(zh|en)\/(practice|speech)(\?|$)/.test(location.pathname + location.search),
      undefined,
      { timeout: 15000 },
    );
  }

  /** 断言已落在 /practice?lessonId=<id>（语言无关）。 */
  async waitPracticeWithLesson(expectedLessonId: string): Promise<void> {
    await this.page.waitForFunction(
      (id) => {
        if (!/^\/(zh|en)\/practice$/.test(location.pathname)) return false;
        return new URLSearchParams(location.search).get("lessonId") === id;
      },
      expectedLessonId,
      { timeout: 15000 },
    );
  }

  /** 断言已落在 /speech?taskId=<id>（语言无关）。 */
  async waitSpeechWithTaskId(expectedTaskId: string): Promise<void> {
    await this.page.waitForFunction(
      (id) => {
        if (!/^\/(zh|en)\/speech$/.test(location.pathname)) return false;
        return new URLSearchParams(location.search).get("taskId") === id;
      },
      expectedTaskId,
      { timeout: 15000 },
    );
  }
}
