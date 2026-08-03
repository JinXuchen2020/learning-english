// Page object for the auth screen (src/app/login/page.tsx).
// Selectors target real DOM: data-component="LoginPage", #username/#password/#nickname,
// the mode-toggle buttons ("Sign In"/"Sign Up"), and the form submit button.
import { Locator, Page } from "@playwright/test";

export default class LoginPage {
  private page: Page;
  private baseUrl: string;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  async open(): Promise<void> {
    await this.page.goto(`${this.baseUrl}/login`);
    await this.page.waitForSelector('[data-component="LoginPage"]');
  }

  async switchToSignUp(): Promise<void> {
    // The mode toggle is a <button aria-pressed> (not the form submit button).
    const toggle: Locator = this.page.locator('button[aria-pressed]', { hasText: "Sign Up" });
    if ((await toggle.getAttribute("aria-pressed")) !== "true") {
      await toggle.click();
    }
  }

  async switchToSignIn(): Promise<void> {
    const toggle: Locator = this.page.locator('button[aria-pressed]', { hasText: "Sign In" });
    if ((await toggle.getAttribute("aria-pressed")) !== "true") {
      await toggle.click();
    }
  }

  async fillUsername(value: string): Promise<void> {
    await this.page.fill("#username", value);
  }

  async fillPassword(value: string): Promise<void> {
    await this.page.fill("#password", value);
  }

  async fillNickname(value: string): Promise<void> {
    await this.page.fill("#nickname", value);
  }

  async submit(): Promise<void> {
    // The submit Button lives inside the <form>; target it directly to avoid
    // matching the mode-toggle buttons that also contain "Sign In".
    await this.page.locator("form button[type=submit]").click();
  }

  async register(username: string, password: string, nickname: string): Promise<void> {
    await this.switchToSignUp();
    await this.fillUsername(username);
    await this.fillPassword(password);
    if (nickname) await this.fillNickname(nickname);
    await this.submit();
  }

  async login(username: string, password: string): Promise<void> {
    await this.switchToSignIn();
    await this.fillUsername(username);
    await this.fillPassword(password);
    await this.submit();
  }

  async getErrorText(): Promise<string | null> {
    const alert: Locator = this.page.locator('[role="alert"]');
    // The error only renders after the async login request rejects and React
    // re-renders, so wait for it instead of reading immediately — otherwise the
    // alert element is still absent and we'd report a misleading "null".
    let appeared = false;
    try {
      await alert.first().waitFor({ state: "visible", timeout: 15000 });
      appeared = true;
    } catch {
      // If we ended up on the home page, the login unexpectedly SUCCEEDED
      // (e.g. the backend accepted the credentials) instead of failing — that
      // is a real bug, surface it clearly rather than a cryptic "null".
      const onHome = await this.page
        .evaluate(() => location.pathname === "/")
        .catch(() => false);
      if (onHome) {
        throw new Error(
          "Login unexpectedly succeeded (redirected to /) for credentials expected to fail. " +
            "Check that the backend rejects this user and that the test uses a non-existent account."
        );
      }
      return null;
    }

    // Once visible, read the text — but retry briefly: between waitFor resolving
    // and textContent() running, React may still be painting the node, and
    // Playwright returns `null` for a momentarily-detached element.
    if (appeared) {
      for (let i = 0; i < 10; i++) {
        const text = (await alert.first().textContent())?.trim();
        if (text) return text;
        await this.page.waitForTimeout(100);
      }
    }
    return null;
  }
}
