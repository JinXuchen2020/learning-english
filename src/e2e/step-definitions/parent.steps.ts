// Parent approval steps (no PIN gate — AI-710+: a parent account logs in
// directly into /parent; the panel is rendered by ParentInner when role==='parent').
import { Given, When, Then } from "@cucumber/cucumber";
import ParentPage from "../support/pages/parent";
import type E2EWorld from "../support/world";

Given("I open the parent panel", async function (this: E2EWorld) {
  await new ParentPage(this.page, this.baseUrl).open();
});

Then("I should be in the parent panel", async function (this: E2EWorld) {
  await new ParentPage(this.page, this.baseUrl).waitForPanel();
});

Then(
  "I should see at least {int} pending approval",
  async function (this: E2EWorld, expected: number) {
    const page = new ParentPage(this.page, this.baseUrl);
    try {
      await page.waitForPendingApprovals(expected);
    } catch {
      const count = await this.page
        .locator('[data-component="ApprovalItem"]')
        .count();
      throw new Error(`Expected at least ${expected} pending approval(s) but found ${count}`);
    }
  }
);

When(
  "I approve the first pending approval",
  async function (this: E2EWorld) {
    await new ParentPage(this.page, this.baseUrl).approveFirst();
  }
);
