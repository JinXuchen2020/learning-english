// Parent report (weak words) steps.
import { Given, When, Then } from "@cucumber/cucumber";
import ParentReportPage from "../support/pages/parent-report";
import { seedWeakWord } from "../support/seed";
import type E2EWorld from "../support/world";

Given("I open the parent report", async function (this: E2EWorld) {
  await new ParentReportPage(this.page, this.baseUrl).open();
});

// A freshly-registered user has no WordProgress, so the weekly report shows no
// weak words. Seed a wrong-answer streak for the target word via the backend so
// the report has something to drill down from. (See support/seed.ts.)
Given(
  "the weekly report has a weak word {string}",
  async function (this: E2EWorld, word: string) {
    if (!this.testUser) {
      throw new Error("Must be logged in before seeding weak words");
    }
    await seedWeakWord(this.testUser, word);
  }
);

Then(
  "I should see at least {int} weak word",
  async function (this: E2EWorld, expected: number) {
    const page = new ParentReportPage(this.page, this.baseUrl);
    try {
      await page.waitForWeakWords(expected);
    } catch {
      const count = await page.weakWordCount();
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
