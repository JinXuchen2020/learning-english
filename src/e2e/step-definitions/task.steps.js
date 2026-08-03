// Daily task completion journey.
const { When, Then } = require("@cucumber/cucumber");
const { HomePage } = require("../support/pages/home");

When("I complete the first daily task", async function () {
  const home = new HomePage(this.page, this.baseUrl);
  await home.completeFirstTask();
});

Then("that task should be marked completed", async function () {
  const home = new HomePage(this.page, this.baseUrl);
  if (!(await home.isFirstTaskCompleted())) {
    throw new Error("First daily task was not marked completed");
  }
});

Then("the completed count should be {string}", async function (expected) {
  // The "X/Y done" badge updates only after the progress API resolves.
  await this.page.waitForFunction(
    (want) => {
      const span = document.querySelector('[data-component="DailyTasks"] h2 span');
      return span && span.textContent.trim() === want;
    },
    expected,
    { timeout: 10000 }
  );
});
