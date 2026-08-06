// Speech task deep-link + completion write-back steps (AI-308).
import { When, Then } from "@cucumber/cucumber";
import HomePage from "../support/pages/home";
import SpeechPage from "../support/pages/speech";
import type E2EWorld from "../support/world";

When("I open the home dashboard", async function (this: E2EWorld) {
  const home = new HomePage(this.page, this.baseUrl);
  await home.openDashboard();
});

When("I tap the speaking task", async function (this: E2EWorld) {
  const home = new HomePage(this.page, this.baseUrl);
  this.speakingTaskId = await home.clickSpeakingTask();
});

Then("I should be on the speech practice page", async function (this: E2EWorld) {
  await this.page.waitForSelector('[data-component="SpeechPage"]', { timeout: 15000 });
});

Then("the speech page url should include a task id", async function (this: E2EWorld) {
  const url = this.page.url();
  const taskId = new URL(url).searchParams.get("taskId");
  if (!taskId) {
    throw new Error(`Expected speech page URL to include taskId, got: ${url}`);
  }
});

When("I complete the speech practice session", async function (this: E2EWorld) {
  const speech = new SpeechPage(this.page, this.baseUrl);
  // Deterministic passing score so the session yields stars and reaches completion.
  await speech.mockEvaluate(95, true, "good", "cheer");
  await speech.completeSession();
});

When("I return to the home dashboard", async function (this: E2EWorld) {
  const speech = new SpeechPage(this.page, this.baseUrl);
  await speech.clickBackHome();
  const home = new HomePage(this.page, this.baseUrl);
  await home.waitLoaded();
});

Then("the speaking task should be marked completed", async function (this: E2EWorld) {
  const home = new HomePage(this.page, this.baseUrl);
  const ok = await home.isSpeakingTaskCompleted(this.speakingTaskId);
  if (!ok) {
    const captured = this.speakingTaskId;
    const url = this.page.url();
    const cardCount = await this.page
      .locator('[data-component="DailyTasks"] [data-task-id]')
      .count();
    const anyPressed = await this.page
      .locator('[data-component="DailyTasks"] [data-task-id][aria-pressed="true"]')
      .count();
    throw new Error(
      `Speaking task not completed. capturedTaskId=${captured} currentUrl=${url} homeTaskCards=${cardCount} pressedCards=${anyPressed}`,
    );
  }
});

When("I tap the first non-speaking task", async function (this: E2EWorld) {
  const home = new HomePage(this.page, this.baseUrl);
  await home.tapFirstNonSpeakingTask();
});
