// Daily task completion journey.
import { When, Then } from "@cucumber/cucumber";
import HomePage from "../support/pages/home";
import type E2EWorld from "../support/world";

When("I complete the first daily task", async function (this: E2EWorld) {
  const home = new HomePage(this.page, this.baseUrl);
  await home.completeFirstTask();
});

Then("that task should be marked completed", async function (this: E2EWorld) {
  const home = new HomePage(this.page, this.baseUrl);
  if (!(await home.isFirstTaskCompleted())) {
    throw new Error("First daily task was not marked completed");
  }
});

Then("the completed count should be {string}", async function (this: E2EWorld, expected: string) {
  // The "X/Y done" badge updates only after the progress API resolves.
  await this.page.waitForFunction(
    (want: string) => {
      const span = document.querySelector('[data-component="DailyTasks"] h2 span');
      return span && span.textContent.trim() === want;
    },
    expected,
    { timeout: 10000 }
  );
});
