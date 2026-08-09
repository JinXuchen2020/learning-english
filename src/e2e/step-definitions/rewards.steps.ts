// Rewards store + parent approval steps (AI-701).
import { Given, When, Then } from "@cucumber/cucumber";
import RewardsPage from "../support/pages/rewards";
import type E2EWorld from "../support/world";

Given("I open the rewards store", async function (this: E2EWorld) {
  await new RewardsPage(this.page, this.baseUrl).open();
});

Then(
  "I should see at least {int} reward",
  async function (this: E2EWorld, expected: number) {
    const page = new RewardsPage(this.page, this.baseUrl);
    try {
      await page.waitForRewards(expected);
    } catch {
      const count = await this.page
        .locator('[data-component="RewardCard"]')
        .count();
      throw new Error(`Expected at least ${expected} reward(s) but found ${count}`);
    }
  }
);

Then(
  "I should see my points balance at least {int}",
  async function (this: E2EWorld, expected: number) {
    const page = new RewardsPage(this.page, this.baseUrl);
    try {
      await page.waitForBalanceAtLeast(expected);
    } catch {
      const text = await this.page
        .locator('[data-component="BalanceValue"]')
        .textContent()
        .catch(() => null);
      throw new Error(
        `Expected points balance >= ${expected} but saw "${text}"`
      );
    }
  }
);

Then("I should see the level ring", async function (this: E2EWorld) {
  const page = new RewardsPage(this.page, this.baseUrl);
  if (!(await page.levelRingVisible())) {
    throw new Error("Level ring not visible on rewards store");
  }
});

When(
  "I redeem the reward {string}",
  async function (this: E2EWorld, title: string) {
    await new RewardsPage(this.page, this.baseUrl).redeem(title);
  }
);

Then(
  "I should see my redemption status {string}",
  async function (this: E2EWorld, status: string) {
    const page = new RewardsPage(this.page, this.baseUrl);
    try {
      await page.waitForMyRedemptionStatus(status);
    } catch {
      const statuses = await this.page
        .locator('[data-component="MyRedemption"]')
        .evaluateAll((els) => els.map((e) => e.getAttribute("data-redemption-status")))
        .catch(() => []);
      throw new Error(
        `Expected a redemption with status "${status}" but saw [${statuses.join(", ")}]`
      );
    }
  }
);

When(
  "the parent approves my redemption",
  async function (this: E2EWorld) {
    const page = new RewardsPage(this.page, this.baseUrl);
    // 此时恰好有一条 pending 兑换单，取其 id 进行家长审批。
    const id = await page.getRedemptionIdByStatus("pending");
    await page.approveRedemption(id);
  }
);
