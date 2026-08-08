// AI-605 review reminder steps.
import { Then, When } from "@cucumber/cucumber";
import HomePage from "../support/pages/home";
import ReviewPage from "../support/pages/review";
import { seedDueReview } from "../support/seed";
import type E2EWorld from "../support/world";

When('I seed a due review word "Cat"', async function (this: E2EWorld) {
  if (!this.testUser) {
    throw new Error('No test user; run "I am logged in as a new user" first');
  }
  await seedDueReview(this.testUser, "Cat");
  // 重新挂载 Home（客户端导航，token 仅内存）以拉取新播种的到期复习词。
  const home = new HomePage(this.page, this.baseUrl);
  await home.bounceToHome();
});

Then(
  "I should see the review reminder card with at least 1 word",
  async function (this: E2EWorld) {
    const page = new ReviewPage(this.page, this.baseUrl);
    await page.waitForReviewCard();
    const count = await page.reviewWordLinkCount();
    if (count < 1) {
      throw new Error("Expected review reminder card to list at least 1 due word");
    }
  },
);

Then("I should see a review task in today's tasks", async function (this: E2EWorld) {
  const page = new ReviewPage(this.page, this.baseUrl);
  const count = await page.reviewTaskInTasksCount();
  if (count < 1) {
    throw new Error("Expected today's tasks to contain at least 1 review task");
  }
});

When("I click the first review word link", async function (this: E2EWorld) {
  const page = new ReviewPage(this.page, this.baseUrl);
  await page.clickFirstReviewWord();
});

Then('I should be on the practice page for "Cat"', async function (this: E2EWorld) {
  const page = new ReviewPage(this.page, this.baseUrl);
  await page.practiceShowsWord("Cat");
});
