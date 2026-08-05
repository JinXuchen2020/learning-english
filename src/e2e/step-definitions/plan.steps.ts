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
  if (!text || !text.includes("学习计划")) {
    throw new Error(`Expected plan wizard heading but got: "${text}"`);
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
