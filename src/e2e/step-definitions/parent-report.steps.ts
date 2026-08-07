// Parent report (weak words) steps.
import { Given, When, Then } from "@cucumber/cucumber";
import ParentReportPage from "../support/pages/parent-report";
import type E2EWorld from "../support/world";

Given("I open the parent report", async function (this: E2EWorld) {
  await new ParentReportPage(this.page, this.baseUrl).open();
});

Then(
  "I should see at least {int} weak word",
  async function (this: E2EWorld, expected: number) {
    const count = await new ParentReportPage(this.page, this.baseUrl).weakWordCount();
    if (count < expected) {
      throw new Error(`Expected at least ${expected} weak word(s) but found ${count}`);
    }
  }
);

// Navigation lives here (the step that used to throw "element was detached").
When("I click the weak word {string}", async function (this: E2EWorld, word: string) {
  await new ParentReportPage(this.page, this.baseUrl).drillDownToPractice(word);
});

Then(
  "I should land on the practice page focused on {string}",
  async function (this: E2EWorld, word: string) {
    await new ParentReportPage(this.page, this.baseUrl).assertOnPracticeForWord(word);
  }
);
