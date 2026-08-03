// Shared Given steps used across multiple feature files.
// Defined exactly once to avoid Cucumber "multiple step definitions" errors.
import { Given } from "@cucumber/cucumber";
import { loginAsNewUser } from "../support/helpers";
import type E2EWorld from "../support/world";

Given("I am logged in as a new user", async function (this: E2EWorld) {
  this.testUser = await loginAsNewUser(this.page, this.baseUrl);
});
