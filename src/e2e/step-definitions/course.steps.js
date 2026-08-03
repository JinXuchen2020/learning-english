// Course browsing journey.
const { When, Then } = require("@cucumber/cucumber");
const { HomePage } = require("../support/pages/home");
const { CoursePage } = require("../support/pages/course");

When("I click the first course card", async function () {
  const home = new HomePage(this.page, this.baseUrl);
  await home.clickFirstCourse();
});

Then("I should see the course detail with a lesson list", async function () {
  const course = new CoursePage(this.page);
  await course.waitDetail();
});

Then("I should see at least {int} lesson", async function (min) {
  const course = new CoursePage(this.page);
  const count = await course.lessonCount();
  if (count < min) {
    throw new Error(`Expected at least ${min} lessons but found ${count}`);
  }
});
