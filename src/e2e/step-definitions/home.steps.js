// Home dashboard assertions.
const { Then } = require("@cucumber/cucumber");
const { HomePage } = require("../support/pages/home");

Then("I should see the greeting containing {string}", async function (text) {
  const home = new HomePage(this.page, this.baseUrl);
  const greeting = await home.greetingText();
  if (!greeting || !greeting.includes(text)) {
    throw new Error(`Expected greeting to contain "${text}" but got: "${greeting}"`);
  }
});

Then("I should see {int} course cards", async function (expected) {
  const home = new HomePage(this.page, this.baseUrl);
  const count = await home.courseCount();
  if (count !== expected) {
    throw new Error(`Expected ${expected} course cards but found ${count}`);
  }
});

Then("I should see {int} daily tasks", async function (expected) {
  const home = new HomePage(this.page, this.baseUrl);
  const count = await home.taskCount();
  if (count !== expected) {
    throw new Error(`Expected ${expected} daily tasks but found ${count}`);
  }
});
