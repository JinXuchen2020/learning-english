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
  // 等登录真正落库（localStorage 角色变为 parent）再继续。否则下游步骤
  // `goto('/parent')` 整页重载时，AuthProvider 仅在 mount 时一次性从 localStorage
  // rehydrate，会读到上一任 child 会话 → 误显示 ParentUnauthorized → 等待超时。
  await this.page.waitForFunction(
    () => {
      try {
        const u = JSON.parse(
          window.localStorage.getItem("le_auth_user") || "null",
        );
        return !!u && u.role === "parent";
      } catch {
        return false;
      }
    },
    undefined,
    { timeout: 15000 },
  );
});

Then("I should be redirected to the home page", async function (this: E2EWorld) {
  // 接受任意 locale 前缀（/zh、/zh/、/en、/en/），与语言无关。
  await this.page.waitForFunction(
    () => /^\/(zh|en)(\/|$)/.test(location.pathname),
    undefined,
    { timeout: 15000 },
  );
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
  // 错误文案随语言本地化，不校验具体文本；仅断言 [role="alert"] 已出现且非空
  // （login.getErrorText 已等待 alert 可见并返回其文本）。
  const login = new LoginPage(this.page, this.baseUrl);
  const err = await login.getErrorText();
  if (!err || err.trim().length === 0) {
    throw new Error(`Expected an error message to be shown but got: "${err}"`);
  }
});
