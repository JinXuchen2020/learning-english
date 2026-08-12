// AI-709: more-drawer steps — open the child "更多" tab drawer and reach
// secondary pages (chat / plan / word-cards / speech). Reuses the shared
// "I am logged in as a new user" step (common.steps.ts).
import { Then, When } from "@cucumber/cucumber";
import type E2EWorld from "../support/world";

When("I open the more drawer", async function (this: E2EWorld) {
  // 仅「更多」按钮带 aria-haspopup="dialog"，与语言无关，稳定定位。
  const btn = this.page
    .locator('[data-component="TabNav"] button[aria-haspopup="dialog"]')
    .first();
  await btn.click();
  await this.page
    .locator('[data-component="MoreDrawer"]')
    .first()
    .waitFor({ state: "visible", timeout: 10000 });
});

Then(
  "the more drawer should show {int} cards",
  async function (this: E2EWorld, count: number) {
    const n = await this.page.locator('[data-component="MoreDrawerCard"]').count();
    if (n !== count) {
      throw new Error(`Expected ${count} more-drawer cards but found ${n}`);
    }
  },
);

When(
  "I tap the more-drawer card for {string}",
  async function (this: E2EWorld, route: string) {
    const card = this.page
      .locator(`a[data-component="MoreDrawerCard"][href*="${route}"]`)
      .first();
    await card.click();
    // 导航到目标路由（带 locale 前缀），例如 /zh/chat。
    await this.page.waitForFunction(
      (r: string) => window.location.pathname.includes("/" + r),
      route,
      { timeout: 10000 },
    );
  },
);

Then(
  "the more drawer should be closed",
  async function (this: E2EWorld) {
    await this.page.waitForFunction(
      () => !document.querySelector('[data-component="MoreDrawer"]'),
      undefined,
      { timeout: 5000 },
    );
  },
);
