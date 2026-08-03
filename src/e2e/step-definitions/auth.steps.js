// Authentication journey steps: register, log in, wrong-password error.
const { Given, When, Then } = require("@cucumber/cucumber");
const { LoginPage } = require("../support/pages/login");
const { HomePage } = require("../support/pages/home");
const { makeUser } = require("../support/helpers");

Given("I am on the login page", async function () {
  const login = new LoginPage(this.page, this.baseUrl);
  await login.open();
});

When("I switch to {string} mode", async function (mode) {
  const login = new LoginPage(this.page, this.baseUrl);
  if (mode === "Sign Up") await login.switchToSignUp();
  else await login.switchToSignIn();
});

When(
  "I register with a unique username and password {string}",
  async function (password) {
    const user = makeUser();
    const login = new LoginPage(this.page, this.baseUrl);
    await login.register(user.username, password, user.nickname);
    this.testUser = user;
  }
);

When(
  "I log in with username {string} and password {string}",
  async function (username, password) {
    const login = new LoginPage(this.page, this.baseUrl);
    await login.login(username, password);
  }
);

When("I go to the login page", async function () {
  const login = new LoginPage(this.page, this.baseUrl);
  await login.open();
});

When("I log in with the registered user", async function () {
  const login = new LoginPage(this.page, this.baseUrl);
  await login.login(this.testUser.username, this.testUser.password);
});

Then("I should be redirected to the home page", async function () {
  await this.page.waitForFunction(() => location.pathname === "/");
  const home = new HomePage(this.page, this.baseUrl);
  await home.waitLoaded();
});

Then("I should see the greeting {string}", async function (greeting) {
  const home = new HomePage(this.page, this.baseUrl);
  const text = await home.greetingText();
  if (!text || !text.includes(greeting)) {
    throw new Error(`Expected greeting to contain "${greeting}" but got: "${text}"`);
  }
});

Then("I should see an error message {string}", async function (message) {
  const login = new LoginPage(this.page, this.baseUrl);
  const err = await login.getErrorText();
  if (!err || !err.includes(message)) {
    throw new Error(`Expected error containing "${message}" but got: "${err}"`);
  }
});
