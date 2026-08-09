// AI-703 practice variant journeys: mode switching + answering through both
// new quiz modes (listen / combination) to the completion screen.
import { When, Then } from "@cucumber/cucumber";
import PracticePage, { type PracticeMode } from "../support/pages/practice";
import type E2EWorld from "../support/world";

When("I click the first lesson", async function (this: E2EWorld) {
  const practice = new PracticePage(this.page, this.baseUrl);
  await practice.clickFirstLesson();
});

Then("I should see the practice page", async function (this: E2EWorld) {
  await this.page.waitForSelector('[data-component="WordPractice"]');
});

When(
  /^I switch to (multiple|listen|combination) practice mode$/,
  async function (this: E2EWorld, mode: PracticeMode) {
    const practice = new PracticePage(this.page, this.baseUrl);
    await practice.switchMode(mode);
  },
);

Then("I should see the listen prompt", async function (this: E2EWorld) {
  await this.page.waitForSelector('[data-component="ListenPrompt"]');
});

Then("I should see the combination prompt", async function (this: E2EWorld) {
  await this.page.waitForSelector('[data-component="ComboPrompt"]');
});

When("I answer all questions correctly", async function (this: E2EWorld) {
  const practice = new PracticePage(this.page, this.baseUrl);
  await practice.answerAllCorrectly();
});

Then("I should see the practice completion screen", async function (this: E2EWorld) {
  const practice = new PracticePage(this.page, this.baseUrl);
  if (!(await practice.isComplete())) {
    throw new Error("Expected practice completion screen (QuizComplete)");
  }
});
