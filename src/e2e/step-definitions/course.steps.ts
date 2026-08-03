// Course browsing journey.
import { When, Then } from "@cucumber/cucumber";
import HomePage from "../support/pages/home";
import CoursePage from "../support/pages/course";
import type E2EWorld from "../support/world";

When("I click the first course card", async function (this: E2EWorld) {
  const home = new HomePage(this.page, this.baseUrl);
  await home.clickFirstCourse();
});

Then("I should see the course detail with a lesson list", async function (this: E2EWorld) {
  const course = new CoursePage(this.page);
  await course.waitDetail();
});

Then("I should see at least {int} lesson", async function (this: E2EWorld, min: number) {
  const course = new CoursePage(this.page);
  const count = await course.lessonCount();
  if (count < min) {
    throw new Error(`Expected at least ${min} lessons but found ${count}`);
  }
});
