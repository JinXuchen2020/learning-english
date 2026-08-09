// Page object for the AI word cards page (src/app/word-cards/page.tsx).
//
// Card items render as:
//   <li data-component="WordCardItem" data-status="pending" data-card-id="...">
//     ...
//     <button data-component="ApproveButton">通过</button>
//     <button data-component="RejectButton">驳回</button>
//   </li>
//
// The root container is <div data-component="WordCards">. The generator has
// <input data-component="InterestInput"> and <button data-component="GenerateButton">.
//
// open() navigates via the TabNav link (client-side) so the in-memory auth token
// survives — a full page.goto would reset module memory and bounce to /login via
// AuthGate, exactly like ParentReportPage.open / PlanPage.open.
import { Page } from "@playwright/test";

// Route of the word cards page.
const PAGE_PATH = "/word-cards";

export default class WordCardsPage {
  private page: Page;
  private baseUrl: string;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  async open(): Promise<void> {
    const link = this.page.locator(`nav a[href="${PAGE_PATH}"]`);
    if (await link.count()) {
      await link.first().click();
    } else {
      await this.page.goto(`${this.baseUrl}${PAGE_PATH}`);
    }
    await this.page.waitForSelector('[data-component="WordCards"]');
  }

  async enterInterest(interest: string): Promise<void> {
    await this.page.fill('[data-component="InterestInput"]', interest);
  }

  async clickGenerate(): Promise<void> {
    await this.page.click('[data-component="GenerateButton"]');
  }

  async pendingCardCount(): Promise<number> {
    return this.page
      .locator('[data-component="WordCardItem"][data-status="pending"]')
      .count();
  }

  async approvedCardCount(): Promise<number> {
    return this.page
      .locator('[data-component="WordCardItem"][data-status="approved"]')
      .count();
  }

  /**
   * Approve the first pending card. The click flips the item's data-status to
   * "approved" (ReviewActions unmounts once status != pending), so the approval
   * is observable via the approved card count / item data-status.
   */
  async approveFirstPending(): Promise<void> {
    const btn = this.page
      .locator(
        '[data-component="WordCardItem"][data-status="pending"] [data-component="ApproveButton"]',
      )
      .first();
    await btn.click();
  }

  /** Wait until at least `n` pending cards are rendered (generation is async). */
  async waitForPendingCards(n: number, timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (target: number) =>
        document.querySelectorAll(
          '[data-component="WordCardItem"][data-status="pending"]',
        ).length >= target,
      n,
      { timeout },
    );
  }

  /** Wait until at least 1 approved card appears (approval API is async). */
  async waitForApprovedCard(timeout = 10000): Promise<void> {
    await this.page.waitForFunction(
      () =>
        document.querySelectorAll(
          '[data-component="WordCardItem"][data-status="approved"]',
        ).length >= 1,
      { timeout },
    );
  }
}
