// Page object for the parent report (weak words) page.
//
// Weak-word chips render as:
//   <div data-component="WeakWordItem" data-weak-word="Cat">
//     <a aria-label="练习弱项单词 Cat" href="/practice?focusWord=Cat">Cat</a>
//   </div>
//
// The weak-word <a> is a Next.js <Link> that triggers client-side navigation to
// /practice. Playwright's default click waits for the element to be "stable"
// after scrolling, but the click itself kicks off the route change, which unmounts
// this node — so the actionability retry races with the unmount and reports
// "element was detached from the DOM". (Root cause is the navigation, NOT a
// re-render: the component already uses a stable key={word} and the memoized
// auth context keeps `user` stable, so there is no list remount to fix here.)
//
// clickWeakWord() forces the click (skip the stability re-check that races with
// the navigation) and re-resolves the locator on every retry so it always lands
// on a *live* node.
import { Locator, Page } from "@playwright/test";

// Route of the parent report page (src/app/parent-report/page.tsx).
const REPORT_PATH = "/parent-report";

export default class ParentReportPage {
  private page: Page;
  private baseUrl: string;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  async open(): Promise<void> {
    // Navigate via the TabNav link (client-side) so the in-memory auth token
    // survives. A full page.goto would reset module memory and bounce to
    // /login via AuthGate, just like PlanPage.open.
    const link = this.page.locator(`nav a[href="${REPORT_PATH}"]`);
    if (await link.count()) {
      await link.first().click();
    } else {
      await this.page.goto(`${this.baseUrl}${REPORT_PATH}`);
    }
    await this.page.waitForSelector('[data-component="ParentReport"]');
  }

  async weakWordCount(): Promise<number> {
    return this.page.locator('[data-component="WeakWordItem"]').count();
  }

  /**
   * Click the practice link for a weak word. The click triggers client-side
   * navigation, which unmounts this node, so we force the click (skip the
   * stability re-check that otherwise races the unmount) and re-resolve the
   * locator on every retry so we always dispatch on a live node. This is what
   * fixes the 15s "element was detached from the DOM" timeout flake.
   */
  async clickWeakWord(word: string): Promise<void> {
    const selector = `[data-component="WeakWordItem"][data-weak-word="${word}"] a`;
    const deadline = Date.now() + 15000;
    let lastErr: unknown;
    while (Date.now() < deadline) {
      try {
        const link = this.page.locator(selector).first();
        await link.waitFor({ state: "attached", timeout: 1000 });
        // force: skip visibility/stability re-checks that race with the navigation
        await link.click({ force: true, timeout: 1000 });
        return;
      } catch (err) {
        lastErr = err;
        // Element detached mid-dispatch — retry on a fresh node.
        await this.page.waitForTimeout(120);
      }
    }
    throw new Error(
      `clickWeakWord("${word}") failed after detached-DOM retries: ${String(lastErr)}`
    );
  }

  /** Click a weak word and wait for the practice page to mount via client-side nav. */
  async drillDownToPractice(word: string): Promise<void> {
    await this.clickWeakWord(word);
    await this.page.waitForSelector('[data-component="WordPractice"]', { timeout: 15000 });
    await this.page.waitForFunction(
      (w) => new URLSearchParams(location.search).get("focusWord") === w,
      word,
      { timeout: 15000 }
    );
  }

  /** Assert we landed on the practice page focused on the given word. */
  async assertOnPracticeForWord(word: string): Promise<void> {
    await this.page.waitForSelector('[data-component="WordPractice"]', { timeout: 15000 });
    const focus = await this.page.evaluate(() =>
      new URLSearchParams(location.search).get("focusWord")
    );
    if (focus !== word) {
      throw new Error(`Expected practice page focusWord="${word}" but got "${focus}"`);
    }
  }
}
