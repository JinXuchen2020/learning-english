// Page object for the auth screen (src/app/login/page.tsx).
// Selectors target real DOM: data-component="LoginPage", #username/#password/#nickname,
// the mode-toggle buttons ("Sign In"/"Sign Up"), and the form submit button.
class LoginPage {
  constructor(page, baseUrl) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  async open() {
    await this.page.goto(`${this.baseUrl}/login`);
    await this.page.waitForSelector('[data-component="LoginPage"]');
  }

  async switchToSignUp() {
    // The mode toggle is a <button aria-pressed> (not the form submit button).
    const toggle = this.page.locator('button[aria-pressed]', { hasText: "Sign Up" });
    if ((await toggle.getAttribute("aria-pressed")) !== "true") {
      await toggle.click();
    }
  }

  async switchToSignIn() {
    const toggle = this.page.locator('button[aria-pressed]', { hasText: "Sign In" });
    if ((await toggle.getAttribute("aria-pressed")) !== "true") {
      await toggle.click();
    }
  }

  async fillUsername(value) {
    await this.page.fill("#username", value);
  }

  async fillPassword(value) {
    await this.page.fill("#password", value);
  }

  async fillNickname(value) {
    await this.page.fill("#nickname", value);
  }

  async submit() {
    // The submit Button lives inside the <form>; target it directly to avoid
    // matching the mode-toggle buttons that also contain "Sign In".
    await this.page.locator("form button[type=submit]").click();
  }

  async register(username, password, nickname) {
    await this.switchToSignUp();
    await this.fillUsername(username);
    await this.fillPassword(password);
    if (nickname) await this.fillNickname(nickname);
    await this.submit();
  }

  async login(username, password) {
    await this.switchToSignIn();
    await this.fillUsername(username);
    await this.fillPassword(password);
    await this.submit();
  }

  async getErrorText() {
    const alert = this.page.locator('[role="alert"]');
    // The error only renders after the async login request rejects and React
    // re-renders, so wait for it instead of reading immediately — otherwise the
    // alert element is still absent and we'd report a misleading "null".
    try {
      await alert.first().waitFor({ state: "visible", timeout: 10000 });
    } catch {
      return null;
    }
    return (await alert.first().textContent())?.trim() || null;
  }
}

module.exports = { LoginPage };
