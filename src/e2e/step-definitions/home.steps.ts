// Home dashboard assertions.
import { Given, Then, When } from "@cucumber/cucumber";
import HomePage from "../support/pages/home";
import ChatPage from "../support/pages/chat";
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
    const match = text?.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) {
      throw new Error(`Expected plan progress text like "X/Y" but got: "${text}"`);
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

// AI-408：聊天星星 Home 展示
Given(
  "the chat stars endpoint returns {int} stars",
  async function (this: E2EWorld, stars: number) {
    const chat = new ChatPage(this.page, this.baseUrl);
    await chat.mockChatStars(stars);
  },
);

Then(
  "I should see the chat stars card with {int}",
  async function (this: E2EWorld, expected: number) {
    const chat = new ChatPage(this.page, this.baseUrl);
    // 等待 Home 的异步 getChatStars 装载完成（卡片仅在 chatStars>0 时渲染）。
    await this.page
      .locator('[data-component="ChatStars"]')
      .first()
      .waitFor({ timeout: 10000 });
    const text = await chat.chatStarsText();
    if (!text || !text.includes(String(expected))) {
      throw new Error(`Expected chat stars card with ${expected} but got "${text}"`);
    }
  },
);

// --- AI-504：今日 AI 小结卡片 ---

Given(
  "the daily report endpoint returns a report with summary {string} and weak words {string}",
  async function (this: E2EWorld, summary: string, weakWords: string) {
    const home = new HomePage(this.page, this.baseUrl);
    await home.mockDailyReport(summary, weakWords);
  },
);

Given(
  "the daily report endpoint fails first then succeeds with summary {string}",
  async function (this: E2EWorld, summary: string) {
    const home = new HomePage(this.page, this.baseUrl);
    await home.mockDailyReportFailThenSuccess(summary);
  },
);

Then("I should see the AI report card", async function (this: E2EWorld) {
  const home = new HomePage(this.page, this.baseUrl);
  if (!(await home.reportCardVisible())) {
    throw new Error("Expected the AI report card (data-component=AiReportCard) to be visible");
  }
});

Then(
  "the AI report summary should contain {string}",
  async function (this: E2EWorld, text: string) {
    const home = new HomePage(this.page, this.baseUrl);
    const summary = await home.reportSummaryText();
    if (!summary || !summary.includes(text)) {
      throw new Error(`Expected AI report summary to contain "${text}" but got "${summary}"`);
    }
  },
);

Then(
  "the AI report weak words should contain {string} and {string}",
  async function (this: E2EWorld, a: string, b: string) {
    const home = new HomePage(this.page, this.baseUrl);
    const words = await home.reportWeakWordsText();
    if (!words) {
      throw new Error("Expected AI report weak words to be rendered but found none");
    }
    if (!words.includes(a) || !words.includes(b)) {
      throw new Error(`Expected weak words to contain "${a}" and "${b}" but got "${words}"`);
    }
  },
);

When("I expand the AI report details", async function (this: E2EWorld) {
  const home = new HomePage(this.page, this.baseUrl);
  await home.expandReport();
});

Then(
  "I should see the AI report details containing the report date",
  async function (this: E2EWorld) {
    const home = new HomePage(this.page, this.baseUrl);
    const details = await home.reportDetailsText();
    // 详情渲染「日期：YYYY-MM-DD」，断言含日期形态。
    if (!details || !/\d{4}-\d{2}-\d{2}/.test(details)) {
      throw new Error(`Expected AI report details to contain a date but got "${details}"`);
    }
  },
);

Then("I should see the AI report generate button", async function (this: E2EWorld) {
  const home = new HomePage(this.page, this.baseUrl);
  if (!(await home.generateButtonVisible())) {
    throw new Error("Expected the AI report generate button to be visible");
  }
});

Then(
  "I should see the AI report summary containing {string}",
  async function (this: E2EWorld, text: string) {
    const home = new HomePage(this.page, this.baseUrl);
    const summary = await home.reportSummaryText();
    if (!summary || !summary.includes(text)) {
      throw new Error(`Expected AI report summary to contain "${text}" but got "${summary}"`);
    }
  },
);

When("I click the AI report generate button", async function (this: E2EWorld) {
  const home = new HomePage(this.page, this.baseUrl);
  // 先翻转端点为成功态，再点击重试（兼容 StrictMode 双调用）。
  await home.enableReportSuccess();
  await home.clickGenerate();
});
