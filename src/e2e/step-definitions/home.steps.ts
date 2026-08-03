// Home dashboard assertions.
import { Then } from "@cucumber/cucumber";
import HomePage from "../support/pages/home";
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
