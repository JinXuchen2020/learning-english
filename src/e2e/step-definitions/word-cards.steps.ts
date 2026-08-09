// AI word cards steps (AI-601).
import { Given, When, Then } from "@cucumber/cucumber";
import WordCardsPage from "../support/pages/wordCards";
import type E2EWorld from "../support/world";

When("I open the word cards page", async function (this: E2EWorld) {
  await new WordCardsPage(this.page, this.baseUrl).open();
});

When(
  "I enter interest {string} into the generator",
  async function (this: E2EWorld, interest: string) {
    await new WordCardsPage(this.page, this.baseUrl).enterInterest(interest);
  },
);

When("I click the word card generate button", async function (this: E2EWorld) {
  const page = new WordCardsPage(this.page, this.baseUrl);
  await page.clickGenerate();
  // Generation hits the backend (mock/degraded template when no key) and renders
  // pending cards asynchronously — wait for at least one to appear.
  await page.waitForPendingCards(1);
});

Then(
  "I should see at least {int} pending word card",
  async function (this: E2EWorld, expected: number) {
    const count = await new WordCardsPage(this.page, this.baseUrl).pendingCardCount();
    if (count < expected) {
      throw new Error(
        `Expected at least ${expected} pending word card(s) but found ${count}`,
      );
    }
  },
);

When(
  "I approve the first pending word card",
  async function (this: E2EWorld) {
    const page = new WordCardsPage(this.page, this.baseUrl);
    await page.approveFirstPending();
    // Approval hits the backend asynchronously — wait for the card's
    // data-status to flip to "approved" before proceeding.
    await page.waitForApprovedCard();
  },
);

Then(
  "the approved word card should have status {string}",
  async function (this: E2EWorld, status: string) {
    const approved = await new WordCardsPage(this.page, this.baseUrl).approvedCardCount();
    if (approved < 1) {
      throw new Error(
        `Expected at least 1 word card with status "${status}" but found ${approved}`,
      );
    }
  },
);
