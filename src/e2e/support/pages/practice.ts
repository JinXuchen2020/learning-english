// Page object for the practice page (src/app/practice/page.tsx).
//
// The root container is <div data-component="WordPractice">. Each word card
// shows an adaptive difficulty badge <span data-component="DifficultyBadge"
// data-difficulty="easy|medium|hard"> when the user has a difficulty profile
// for that word (AI-602).
//
// open() navigates via the TabNav link (client-side) so the in-memory auth
// token survives — a full page.goto would reset module memory and bounce to
// /login via AuthGate (same convention as WordCardsPage.open / PlanPage.open).
import { Page } from "@playwright/test";

const PAGE_PATH = "/practice";

export default class PracticePage {
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
    await this.page.waitForSelector('[data-component="WordPractice"]');
  }

  async difficultyBadgeCount(): Promise<number> {
    return this.page.locator('[data-component="DifficultyBadge"]').count();
  }

  /** Wait until at least `n` difficulty badges are rendered (data loads async). */
  async waitForDifficultyBadges(n: number, timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (target: number) =>
        document.querySelectorAll('[data-component="DifficultyBadge"]').length >=
        target,
      n,
      { timeout },
    );
  }
}
