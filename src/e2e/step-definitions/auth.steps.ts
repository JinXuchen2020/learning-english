// Authentication journey steps: register, log in, wrong-password error.
import { Given, When, Then } from "@cucumber/cucumber";
import LoginPage from "../support/pages/login";
import HomePage from "../support/pages/home";
import { makeUser } from "../support/helpers";
import type E2EWorld from "../support/world";

Given("I am on the login page", async function (this: E2EWorld) {
  const login = new LoginPage(this.page, this.baseUrl);
  await login.open();
});

When("I switch to {string} mode", async function (this: E2EWorld, mode: string) {
  const login = new LoginPage(this.page, this.baseUrl);
  if (mode === "Sign Up") await login.switchToSignUp();
  else await login.switchToSignIn();
});

When(
  "I register with a unique username and password {string}",
  async function (this: E2EWorld, password: string) {
    const user = makeUser();
    const login = new LoginPage(this.page, this.baseUrl);
    await login.register(user.username, password, user.nickname);
    this.testUser = user;
  }
);

When(
  "I log in with username {string} and password {string}",
  async function (this: E2EWorld, username: string, password: string) {
    const login = new LoginPage(this.page, this.baseUrl);
    await login.login(username, password);
  }
);

When("I go to the login page", async function (this: E2EWorld) {
  const login = new LoginPage(this.page, this.baseUrl);
  await login.open();
});

When("I log in with the registered user", async function (this: E2EWorld) {
  const login = new LoginPage(this.page, this.baseUrl);
  await login.login(this.testUser!.username, this.testUser!.password);
});

Then("I should be redirected to the home page", async function (this: E2EWorld) {
  await this.page.waitForFunction(() => location.pathname === "/");
  const home = new HomePage(this.page, this.baseUrl);
  await home.waitLoaded();
});

Then("I should see the greeting {string}", async function (this: E2EWorld, greeting: string) {
  const home = new HomePage(this.page, this.baseUrl);
  const text = await home.greetingText();
  if (!text || !text.includes(greeting)) {
    throw new Error(`Expected greeting to contain "${greeting}" but got: "${text}"`);
  }
});

Then("I should see an error message {string}", async function (this: E2EWorld, message: string) {
  const login = new LoginPage(this.page, this.baseUrl);
  const err = await login.getErrorText();
  if (!err || !err.includes(message)) {
    throw new Error(`Expected error containing "${message}" but got: "${err}"`);
  }
});
