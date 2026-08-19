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
   * 以 SSE 流模拟 `POST /api/ai/plan/generate/stream`（AI-804）。
   * 前端默认走 stream 端点（非流式 `generate` 仅作无 body 兜底），故统一在此
   * 用 `text/event-stream` 逐帧返回，确保 plan-* 既有场景继续封闭运行。
   * 注：本机 Playwright(1.62) 的 `route.fulfill` 将 body 一次性转为 base64 响应，
   * 不支持分块流式；故此处以单帧串（\n\n 分隔的多事件）返回，浏览器端会完整解析
   * 并走 `done` 事件渲染预览 / `error` 事件渲染错误。渐进草稿的渲染逻辑由前端
   * vitest + 组件行为保证，e2e 仅验证「走 stream 端点 → 终态正确」。
   */
  async streamGenerate(
    events: ReadonlyArray<Record<string, unknown>>,
  ): Promise<void> {
    const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
    await this.page.route("**/api/ai/plan/generate/stream", (route) =>
      route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        },
        body,
      }),
    );
  }

  /**
   * Mock `POST /api/ai/plan/generate/stream` 使计划向导在 e2e 中封闭（不依赖外部 AI，
   * 与 chat/speech/report 的 mock 约定一致）。返回一份结构合法的多周计划，确保
   * PlanPreview / PlanWeekCard / PlanDayCard 以及 apply / toggle-day 按钮都能确定性渲染。
   * 结构与原非流式 mock 保持一致，既有 plan-* 场景断言不破。
   */
  async mockGeneratePlan(): Promise<void> {
    const plan = {
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
    };
    await this.streamGenerate([
      { type: "start" },
      { type: "token", text: "Here is your plan." },
      { type: "done", plan, model: "mock-plan" },
    ]);
  }

  /** AI-804：模拟「流式成功」—— start → token → done（多帧，等价渐进流的终态）。 */
  async mockStreamValidPlan(): Promise<void> {
    const plan = {
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
                { type: "main", title: "Cat and Dog", skillType: "vocab", description: "Learn pet words" },
              ],
            },
            {
              day: 2,
              skillType: "listen",
              title: "Listen and Repeat",
              lessons: [{ type: "speaking", title: "Speak the Sounds", skillType: "speak" }],
            },
          ],
        },
      ],
    };
    await this.streamGenerate([
      { type: "start" },
      { type: "token", text: "Thinking about your plan…" },
      { type: "done", plan, model: "mock-stream" },
    ]);
  }

  /**
   * AI-804：模拟「首次失败、重试成功」——第一次返回非法 JSON 错误事件，
   * 第二次（点击重试后重跑流）返回合法计划。用于验证错误显示 + 重试能重跑流。
   */
  async mockStreamErrorThenValid(): Promise<void> {
    const validPlan = {
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
                { type: "main", title: "Cat and Dog", skillType: "vocab", description: "Learn pet words" },
              ],
            },
          ],
        },
      ],
    };
    let calls = 0;
    await this.page.route("**/api/ai/plan/generate/stream", (route) => {
      calls += 1;
      const events =
        calls === 1
          ? [
              { type: "start" },
              { type: "token", text: "{ bad json" },
              { type: "error", code: "PLAN_INVALID_JSON", message: "bad json" },
            ]
          : [
              { type: "start" },
              { type: "token", text: "Here is your plan." },
              { type: "done", plan: validPlan, model: "mock-stream" },
            ];
      route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        },
        body: events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""),
      });
    });
  }

  /** 仅点击生成（不挂 mock）——配合上面的 mockStream* given 使用。 */
  async submitGeneration(): Promise<void> {
    await this.page.locator('button[data-action="generate"]').click();
  }

  async clickRetry(): Promise<void> {
    await this.page.locator('button[data-action="retry-stream"]').click();
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

  /** AI-801：应用成功后留在 /plan；点「回首页」按钮跳到 Home（不再自动跳转）。 */
  async clickGoHome(): Promise<void> {
    await this.page.locator('button[data-action="go-home"]').click();
  }

  /** AI-801：应用成功后「生成配套课程」入口是否可见（GenerateCoursesBlock + 主按钮）。 */
  async isGenerateCoursesVisible(): Promise<boolean> {
    const block = this.page.locator('[data-component="GenerateCoursesBlock"]');
    if ((await block.count()) === 0) return false;
    const btn = this.page.locator('button[data-action="generate-courses"]');
    return (await btn.count()) > 0 && (await btn.first().isVisible());
  }

  /** AI-801：点击「生成配套课程」按钮（驱动 generateCoursesForPlan → 跳 /course）。 */
  async clickGenerateCourses(): Promise<void> {
    await this.page.locator('button[data-action="generate-courses"]').click();
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
