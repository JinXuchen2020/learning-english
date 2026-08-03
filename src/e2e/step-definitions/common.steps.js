// Shared Given steps used across multiple feature files.
// Defined exactly once to avoid Cucumber "multiple step definitions" errors.
const { Given } = require("@cucumber/cucumber");
const { loginAsNewUser } = require("../support/helpers");

Given("I am logged in as a new user", async function () {
  this.testUser = await loginAsNewUser(this.page, this.baseUrl);
});
