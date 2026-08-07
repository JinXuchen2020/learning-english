// Page object for the parent report (weak words) page.
//
// Weak-word chips render as:
//   <div data-component="WeakWordItem" data-weak-word="Cat">
//     <a aria-label="练习弱项单词 Cat" href="/practice?focusWord=Cat">Cat</a>
//   </div>
//
// The report list re-renders on data refresh, which detaches the <a> between
// locator resolution and the click action — Playwright then retries for the
// full timeout and fails with "element was detached from the DOM".
//
// clickWeakWord() works around this by re-resolving the locator on every retry
// so it always lands on a *live* node. (The real fix is stable React keys on
// the WeakWordItem list — see the component-side note in the PR description.)
import { Locator, Page } from "@playwright/test";

// Route of the parent report page. Adjust if the real route differs.
const REPORT_PATH = "/report";

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
   * Click the practice link for a weak word, retrying through transient DOM
   * detachment. The locator is re-resolved on every attempt so we never click a
   * stale (detached) node — this is what fixes the 15s timeout flake.
   */
  async clickWeakWord(word: string): Promise<void> {
    const selector = `[data-component="WeakWordItem"][data-weak-word="${word}"] a`;
    const deadline = Date.now() + 15000;
    let lastErr: unknown;
    while (Date.now() < deadline) {
      try {
        const link = this.page.locator(selector).first();
        await link.waitFor({ state: "visible", timeout: 1000 });
        await link.click({ timeout: 1000 });
        return;
      } catch (err) {
        lastErr = err;
        // Let the in-flight re-render settle, then retry on a fresh node.
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
    await this.page.waitForSelector('[data-component="PracticePage"]', { timeout: 15000 });
    await this.page.waitForFunction(
      (w) => new URLSearchParams(location.search).get("focusWord") === w,
      word,
      { timeout: 15000 }
    );
  }

  /** Assert we landed on the practice page focused on the given word. */
  async assertOnPracticeForWord(word: string): Promise<void> {
    await this.page.waitForSelector('[data-component="PracticePage"]', { timeout: 15000 });
    const focus = await this.page.evaluate(() =>
      new URLSearchParams(location.search).get("focusWord")
    );
    if (focus !== word) {
      throw new Error(`Expected practice page focusWord="${word}" but got "${focus}"`);
    }
  }
}
