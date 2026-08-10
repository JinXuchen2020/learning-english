// AI-708: responsive layout steps — narrow-viewport no horizontal overflow
// + LocaleSwitcher visible. Reuses the shared "I am logged in as a new user"
// step (common.steps.ts) which lands on the home dashboard.
import { Then, When } from "@cucumber/cucumber";
import type E2EWorld from "../support/world";

When(
  "I set the viewport to {int} by {int}",
  async function (this: E2EWorld, width: number, height: number) {
    await this.page.setViewportSize({ width, height });
    // 等 reflow 稳定后再断言滚动尺寸（响应式 clamp / flex 折叠需要一拍）。
    await this.page
      .waitForFunction(() => document.readyState === "complete")
      .catch(() => {});
  },
);

Then(
  "the page should not overflow horizontally",
  async function (this: E2EWorld) {
    await this.page.waitForFunction(
      () => document.documentElement.scrollWidth <= window.innerWidth,
      undefined,
      { timeout: 10000 },
    );
  },
);

Then(
  "the LocaleSwitcher should be visible",
  async function (this: E2EWorld) {
    await this.page
      .locator('[data-component="LocaleSwitcher"]')
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
  },
);
