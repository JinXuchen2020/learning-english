// Plan wizard steps (AI-207).
import { Given, When, Then } from "@cucumber/cucumber";
import PlanPage from "../support/pages/plan";
import type E2EWorld from "../support/world";

Given("I open the plan wizard", async function (this: E2EWorld) {
  const page = new PlanPage(this.page, this.baseUrl);
  await page.open();
});

Then("I should see the plan wizard heading", async function (this: E2EWorld) {
  const page = new PlanPage(this.page, this.baseUrl);
  const text = await page.headingText();
  // 标题文案随语言变化，改用稳定的 PlanTitle 组件是否存在来判定向导已渲染。
  const count = await this.page.locator('[data-component="PlanTitle"]').count();
  if (count === 0) {
    throw new Error(`Expected the plan wizard heading (data-component=PlanTitle) to be visible but got: "${text}"`);
  }
});

Then("I should see {int} age range options", async function (this: E2EWorld, expected: number) {
  const page = new PlanPage(this.page, this.baseUrl);
  const count = await page.ageRangeCount();
  if (count !== expected) throw new Error(`Expected ${expected} age range options but found ${count}`);
});

Then("I should see {int} level options", async function (this: E2EWorld, expected: number) {
  const page = new PlanPage(this.page, this.baseUrl);
  const count = await page.levelCount();
  if (count !== expected) throw new Error(`Expected ${expected} level options but found ${count}`);
});

Then("I should see {int} daily-minute options", async function (this: E2EWorld, expected: number) {
  const page = new PlanPage(this.page, this.baseUrl);
  const count = await page.dailyMinuteCount();
  if (count !== expected) throw new Error(`Expected ${expected} daily-minute options but found ${count}`);
});

Then("I should see {int} interest options", async function (this: E2EWorld, expected: number) {
  const page = new PlanPage(this.page, this.baseUrl);
  const count = await page.interestCount();
  if (count !== expected) throw new Error(`Expected ${expected} interest options but found ${count}`);
});

Then("I should see {int} week options", async function (this: E2EWorld, expected: number) {
  const page = new PlanPage(this.page, this.baseUrl);
  const count = await page.weekCount();
  if (count !== expected) throw new Error(`Expected ${expected} week options but found ${count}`);
});

Then("the generate button should be disabled", async function (this: E2EWorld) {
  const page = new PlanPage(this.page, this.baseUrl);
  if (!(await page.isGenerateDisabled())) {
    throw new Error("Expected generate button to be disabled on an empty form");
  }
});

Then("the generate button should be enabled", async function (this: E2EWorld) {
  const page = new PlanPage(this.page, this.baseUrl);
  if (await page.isGenerateDisabled()) {
    throw new Error("Expected generate button to be enabled after filling the form");
  }
});

When("I select age range {string}", async function (this: E2EWorld, value: string) {
  await new PlanPage(this.page, this.baseUrl).selectAgeRange(value);
});

When("I select level {string}", async function (this: E2EWorld, value: string) {
  await new PlanPage(this.page, this.baseUrl).selectLevel(value);
});

When("I select daily minutes {string}", async function (this: E2EWorld, value: string) {
  await new PlanPage(this.page, this.baseUrl).selectDailyMinutes(value);
});

When("I toggle interest {string}", async function (this: E2EWorld, value: string) {
  await new PlanPage(this.page, this.baseUrl).toggleInterest(value);
});

When("I select weeks {string}", async function (this: E2EWorld, value: string) {
  await new PlanPage(this.page, this.baseUrl).selectWeeks(value);
});

When("I click the generate button", async function (this: E2EWorld) {
  await new PlanPage(this.page, this.baseUrl).clickGenerate();
});

Then(
  "I should see the plan preview with at least {int} week",
  async function (this: E2EWorld, expected: number) {
    const page = new PlanPage(this.page, this.baseUrl);
    await page.waitPreview();
    const count = await page.previewWeekCount();
    if (count < expected) {
      throw new Error(`Expected at least ${expected} plan week(s) but found ${count}`);
    }
  }
);

Then(
  "I should see at least {int} plan day card",
  async function (this: E2EWorld, expected: number) {
    const page = new PlanPage(this.page, this.baseUrl);
    await page.waitPreview();
    const count = await page.planDayCardCount();
    if (count < expected) {
      throw new Error(`Expected at least ${expected} plan day card(s) but found ${count}`);
    }
  }
);

Then("the apply button should be visible", async function (this: E2EWorld) {
  const page = new PlanPage(this.page, this.baseUrl);
  if (!(await page.isApplyVisible())) {
    throw new Error("Expected the apply button to be visible");
  }
});

Then("the regenerate button should be visible", async function (this: E2EWorld) {
  const page = new PlanPage(this.page, this.baseUrl);
  if (!(await page.isRegenerateVisible())) {
    throw new Error("Expected the regenerate button to be visible");
  }
});

When("I click the apply button", async function (this: E2EWorld) {
  await new PlanPage(this.page, this.baseUrl).clickApply();
});

Then(
  "I should see the plan applied success message",
  async function (this: E2EWorld) {
    await new PlanPage(this.page, this.baseUrl).waitAppliedSuccess();
  }
);

Then(
  "I should be on the Home page with daily tasks",
  async function (this: E2EWorld) {
    await new PlanPage(this.page, this.baseUrl).waitHomeWithTasks();
  }
);

When(
  "I toggle the plan day {int} as done",
  async function (this: E2EWorld, index: number) {
    await new PlanPage(this.page, this.baseUrl).toggleDay(index);
  }
);

Then(
  "the plan day {int} should be marked done",
  async function (this: E2EWorld, index: number) {
    const done = await new PlanPage(this.page, this.baseUrl).isDayDone(index);
    if (!done) {
      throw new Error(`Expected plan day ${index} to be marked done`);
    }
  }
);
