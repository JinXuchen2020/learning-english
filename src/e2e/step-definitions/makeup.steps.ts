// AI-704 makeup queue steps.
import { When, Then } from "@cucumber/cucumber";
import HomePage from "../support/pages/home";
import MakeupPage from "../support/pages/makeup";
import { seedMakeup } from "../support/seed";
import type E2EWorld from "../support/world";

When("I seed a makeup queue for yesterday", async function (this: E2EWorld) {
  if (!this.testUser) {
    throw new Error('No test user; run "I am logged in as a new user" first');
  }
  const result = seedMakeup(this.testUser);
  this.makeupWordText = result.wordText;
  this.makeupPlanDayId = result.planDayId;
  // 重新挂载 Home（客户端导航，token 仅内存）以拉取新播种的补学队列。
  const home = new HomePage(this.page, this.baseUrl);
  await home.bounceToHome();
});

Then(
  "I should see the makeup card with at least 1 makeup word and 1 missed task",
  async function (this: E2EWorld) {
    const page = new MakeupPage(this.page, this.baseUrl);
    await page.waitForMakeupCard();
    const weak = await page.weakWordLinkCount();
    const missed = await page.missedTaskCount();
    if (weak < 1) {
      throw new Error("Expected makeup card to list at least 1 makeup word");
    }
    if (missed < 1) {
      throw new Error("Expected makeup card to list at least 1 missed task");
    }
  },
);

When("I click the first makeup word link", async function (this: E2EWorld) {
  const page = new MakeupPage(this.page, this.baseUrl);
  await page.clickFirstWeakWord();
});

Then(
  'I should be on the practice page for the makeup word "Cat"',
  async function (this: E2EWorld) {
    const page = new MakeupPage(this.page, this.baseUrl);
    await page.practiceShowsWord(this.makeupWordText || "Cat");
  },
);

When("I click the first makeup complete button", async function (this: E2EWorld) {
  const page = new MakeupPage(this.page, this.baseUrl);
  await page.clickFirstComplete();
});

Then(
  "the missed task should be removed from the makeup card",
  async function (this: E2EWorld) {
    const page = new MakeupPage(this.page, this.baseUrl);
    await page.waitMissedTasksGone();
  },
);
