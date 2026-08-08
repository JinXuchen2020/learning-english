// AI difficulty adaptation steps (AI-602).
import { Given, When, Then } from "@cucumber/cucumber";
import PracticePage from "../support/pages/practice";
import { seedPracticedWords } from "../support/seed";
import type E2EWorld from "../support/world";

Given(
  "the practice page has practiced words with difficulty data",
  async function (this: E2EWorld) {
    if (!this.testUser) {
      throw new Error('Step requires "I am logged in as a new user" to run first');
    }
    // Seed a few practiced words via the backend so the returning user has a
    // difficulty profile; the free-practice page then renders difficulty badges.
    await seedPracticedWords(this.testUser, 3);
  },
);

When("I open the practice page", async function (this: E2EWorld) {
  await new PracticePage(this.page, this.baseUrl).open();
});

Then(
  "I should see at least {int} word card with a difficulty badge",
  async function (this: E2EWorld, expected: number) {
    const page = new PracticePage(this.page, this.baseUrl);
    await page.waitForDifficultyBadges(expected);
    const count = await page.difficultyBadgeCount();
    if (count < expected) {
      throw new Error(
        `Expected at least ${expected} difficulty badge(s) but found ${count}`,
      );
    }
  },
);
