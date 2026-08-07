// Parent weekly report dashboard assertions (AI-507).
import { Given, Then, When } from "@cucumber/cucumber";
import ParentReportPage from "../support/pages/parent-report";
import type E2EWorld from "../support/world";

Given(
  "the weekly report preview endpoint returns a report with weak words {string} and suggestions {string}",
  async function (this: E2EWorld, weakWords: string, suggestions: string) {
    const page = new ParentReportPage(this.page, this.baseUrl);
    await page.mockWeeklyReport(weakWords, suggestions);
  },
);

When("I open the parent report page", async function (this: E2EWorld) {
  const page = new ParentReportPage(this.page, this.baseUrl);
  await page.openPage();
});

Then("I should see the trend chart", async function (this: E2EWorld) {
  const page = new ParentReportPage(this.page, this.baseUrl);
  if (!(await page.trendChartVisible())) {
    throw new Error("Expected the trend chart (data-component=TrendChart with 7 bars) to be visible");
  }
});

Then(
  "I should see {int} metric cards",
  async function (this: E2EWorld, expected: number) {
    const page = new ParentReportPage(this.page, this.baseUrl);
    const count = await page.metricCardCount();
    if (count !== expected) {
      throw new Error(`Expected ${expected} metric cards but found ${count}`);
    }
  },
);

Then(
  "I should see the weak words {string} and {string}",
  async function (this: E2EWorld, a: string, b: string) {
    const page = new ParentReportPage(this.page, this.baseUrl);
    const text = await page.weakWordsText();
    if (!text) {
      throw new Error("Expected weak words to be rendered but found none");
    }
    if (!text.includes(a) || !text.includes(b)) {
      throw new Error(`Expected weak words to contain "${a}" and "${b}" but got "${text}"`);
    }
  },
);

Then(
  "I should see the suggestion {string}",
  async function (this: E2EWorld, text: string) {
    const page = new ParentReportPage(this.page, this.baseUrl);
    if (!(await page.suggestionVisible(text))) {
      throw new Error(`Expected a suggestion containing "${text}" but none found`);
    }
  },
);

When(
  "I click the weak word {string}",
  async function (this: E2EWorld, word: string) {
    const page = new ParentReportPage(this.page, this.baseUrl);
    await page.clickWeakWord(word);
  },
);

Then(
  "I should land on the practice page focused on {string}",
  async function (this: E2EWorld, word: string) {
    const page = new ParentReportPage(this.page, this.baseUrl);
    const focused = await page.drillDownToPractice(word);
    if (!focused || !focused.toLowerCase().includes(word.toLowerCase())) {
      throw new Error(`Expected practice page focused on "${word}" but got "${focused}"`);
    }
  },
);

When("I click the previous week button", async function (this: E2EWorld) {
  const page = new ParentReportPage(this.page, this.baseUrl);
  await page.clickPrevWeek();
});

Then(
  "I should see the week label containing {string}",
  async function (this: E2EWorld, text: string) {
    const page = new ParentReportPage(this.page, this.baseUrl);
    const label = await page.weekLabelText();
    if (!label || !label.includes(text)) {
      throw new Error(`Expected week label to contain "${text}" but got "${label}"`);
    }
  },
);
