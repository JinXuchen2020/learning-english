// Speech practice steps (AI-307).
import { Given, When, Then } from "@cucumber/cucumber";
import SpeechPage from "../support/pages/speech";
import type E2EWorld from "../support/world";

Given(
  "the speech evaluation will return a passing score",
  async function (this: E2EWorld) {
    const page = new SpeechPage(this.page, this.baseUrl);
    // score 92 → passed=true, level good, mascotExpr 'cheer' (mapped to celebrating).
    await page.mockEvaluate(92, true, "good", "cheer");
  },
);

Given(
  "the speech evaluation will return a failing score",
  async function (this: E2EWorld) {
    const page = new SpeechPage(this.page, this.baseUrl);
    // score 45 → passed=false, level weak, mascotExpr 'encourage' (mapped to encouraging).
    await page.mockEvaluate(45, false, "weak", "encourage");
  },
);

When("I open the speech practice page", async function (this: E2EWorld) {
  const page = new SpeechPage(this.page, this.baseUrl);
  await page.open();
});

Then(
  "I should see the speech practice heading",
  async function (this: E2EWorld) {
    const page = new SpeechPage(this.page, this.baseUrl);
    const text = await page.headingText();
    if (!text || !text.includes("Foxy")) {
      throw new Error(`Expected speech practice heading but got: "${text}"`);
    }
  },
);

Then(
  "I should see at least {int} word card",
  async function (this: E2EWorld, expected: number) {
    const page = new SpeechPage(this.page, this.baseUrl);
    const count = await page.wordCardCount();
    if (count < expected) {
      throw new Error(`Expected at least ${expected} word card(s) but found ${count}`);
    }
  },
);

Then("I should see a listen button", async function (this: E2EWorld) {
  const page = new SpeechPage(this.page, this.baseUrl);
  if (!(await page.isListenButtonVisible())) {
    throw new Error("Expected a listen button on the word card");
  }
});

When("I click the listen button", async function (this: E2EWorld) {
  const page = new SpeechPage(this.page, this.baseUrl);
  await page.clickListen();
});

When("I record my voice", async function (this: E2EWorld) {
  const page = new SpeechPage(this.page, this.baseUrl);
  await page.recordVoice();
});

When("I submit the recording", async function (this: E2EWorld) {
  const page = new SpeechPage(this.page, this.baseUrl);
  await page.submit();
  await page.waitFeedback();
});

Then(
  "I should see the speech feedback panel",
  async function (this: E2EWorld) {
    const panel = this.page.locator('[data-component="SpeechFeedbackPanel"]');
    if ((await panel.count()) === 0) {
      throw new Error("Expected the speech feedback panel to be visible");
    }
  },
);

Then("I should see a star earned", async function (this: E2EWorld) {
  const page = new SpeechPage(this.page, this.baseUrl);
  if (!(await page.isCelebrationVisible())) {
    throw new Error("Expected a star earned (SpeechCelebration) on a passing score");
  }
});

Then(
  "the star count should be {int}",
  async function (this: E2EWorld, expected: number) {
    const page = new SpeechPage(this.page, this.baseUrl);
    const count = await page.starCount();
    if (count !== expected) {
      throw new Error(`Expected star count ${expected} but got ${count}`);
    }
  },
);

Then("I should not see a star earned", async function (this: E2EWorld) {
  const page = new SpeechPage(this.page, this.baseUrl);
  if (await page.isCelebrationVisible()) {
    throw new Error("Expected NO star earned on a failing score");
  }
});
