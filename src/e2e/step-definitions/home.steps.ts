// Home dashboard assertions.
import { Then, When } from "@cucumber/cucumber";
import HomePage from "../support/pages/home";
import type E2EWorld from "../support/world";

Then("I should see the greeting containing {string}", async function (this: E2EWorld, text: string) {
  const home = new HomePage(this.page, this.baseUrl);
  const greeting = await home.greetingText();
  if (!greeting || !greeting.includes(text)) {
    throw new Error(`Expected greeting to contain "${text}" but got: "${greeting}"`);
  }
});

Then("I should see {int} course cards", async function (this: E2EWorld, expected: number) {
  const home = new HomePage(this.page, this.baseUrl);
  const count = await home.courseCount();
  if (count !== expected) {
    throw new Error(`Expected ${expected} course cards but found ${count}`);
  }
});

Then("I should see {int} daily tasks", async function (this: E2EWorld, expected: number) {
  const home = new HomePage(this.page, this.baseUrl);
  const count = await home.taskCount();
  if (count !== expected) {
    throw new Error(`Expected ${expected} daily tasks but found ${count}`);
  }
});

// --- AI-209：计划完成度卡 ---

Then("the plan progress card should be visible", async function (this: E2EWorld) {
  const home = new HomePage(this.page, this.baseUrl);
  if (!(await home.planProgressVisible())) {
    throw new Error("Expected the plan progress card (data-component=PlanProgress) to be visible");
  }
});

Then(
  "the plan progress should show done {string} of total at least {string}",
  async function (this: E2EWorld, done: string, totalAtLeast: string) {
    const home = new HomePage(this.page, this.baseUrl);
    const text = await home.planProgressText();
    const match = text?.match(/已完成\s*(\d+)\s*\/\s*(\d+)\s*天/);
    if (!match) {
      throw new Error(`Expected plan progress text like "已完成 X/Y 天" but got: "${text}"`);
    }
    const doneDays = Number(match[1]);
    const totalDays = Number(match[2]);
    if (String(doneDays) !== done) {
      throw new Error(`Expected done=${done} but got ${doneDays} (text: "${text}")`);
    }
    if (totalDays < Number(totalAtLeast)) {
      throw new Error(`Expected total >= ${totalAtLeast} but got ${totalDays} (text: "${text}")`);
    }
  }
);

When("I complete all daily tasks on Home", async function (this: E2EWorld) {
  const home = new HomePage(this.page, this.baseUrl);
  await home.completeAllTasks();
});

Then(
  "the plan progress done count should be greater than {string}",
  async function (this: E2EWorld, threshold: string) {
    const home = new HomePage(this.page, this.baseUrl);
    const doneDays = await home.planDoneDays();
    if (!(doneDays > Number(threshold))) {
      throw new Error(`Expected plan done count > ${threshold} but got ${doneDays}`);
    }
  }
);
