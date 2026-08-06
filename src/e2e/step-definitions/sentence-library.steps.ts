// Sentence library steps (AI-309).
import { Given, When, Then } from "@cucumber/cucumber";
import SpeechPage from "../support/pages/speech";
import type E2EWorld from "../support/world";

When("I switch to sentences mode", async function (this: E2EWorld) {
  const page = new SpeechPage(this.page, this.baseUrl);
  await page.switchToSentences();
});

Then(
  "I should see at least {int} sentence card",
  async function (this: E2EWorld, expected: number) {
    const page = new SpeechPage(this.page, this.baseUrl);
    const count = await page.sentenceCardCount();
    if (count < expected) {
      throw new Error(`Expected at least ${expected} sentence card(s) but found ${count}`);
    }
  },
);
