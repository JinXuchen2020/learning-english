// Parent mode steps (AI-702). PIN gate → setup/verify → approve redemptions.
import { Given, When, Then } from "@cucumber/cucumber";
import ParentPage from "../support/pages/parent";
import type E2EWorld from "../support/world";

Given("I open the parent panel", async function (this: E2EWorld) {
  await new ParentPage(this.page, this.baseUrl).open();
});

Then("I should see the parent PIN gate", async function (this: E2EWorld) {
  await new ParentPage(this.page, this.baseUrl).waitForGate();
});

Then("I should be in the parent panel", async function (this: E2EWorld) {
  await new ParentPage(this.page, this.baseUrl).waitForPanel();
});

When("I set up the parent PIN {string}", async function (this: E2EWorld, pin: string) {
  await new ParentPage(this.page, this.baseUrl).setPin(pin);
});

When("I enter the parent PIN {string}", async function (this: E2EWorld, pin: string) {
  await new ParentPage(this.page, this.baseUrl).enterPin(pin);
});

Then("I should see a PIN error", async function (this: E2EWorld) {
  await new ParentPage(this.page, this.baseUrl).waitForPinError();
});

Then(
  "I should still see the parent PIN gate",
  async function (this: E2EWorld) {
    await new ParentPage(this.page, this.baseUrl).waitForGate();
  }
);

When("I exit the parent mode", async function (this: E2EWorld) {
  await new ParentPage(this.page, this.baseUrl).exitParent();
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
