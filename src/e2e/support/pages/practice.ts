// Page object for the practice page (src/app/practice/page.tsx).
//
// The root container is <div data-component="WordPractice">. Each word card
// shows an adaptive difficulty badge <span data-component="DifficultyBadge"
// data-difficulty="easy|medium|hard"> when the user has a difficulty profile
// for that word (AI-602).
//
// AI-703: three quiz modes are switchable via the ModeSwitcher
// (data-component="ModeSwitcher", buttons data-action="mode-multiple|mode-listen|mode-combination").
// Answer buttons carry data-answer-correct="true" on the correct option so a
// test can answer deterministically without reading the (possibly hidden) word.
//
// open() navigates via the TabNav link (client-side) so the in-memory auth
// token survives — a full page.goto would reset module memory and bounce to
// /login via AuthGate (same convention as WordCardsPage.open / PlanPage.open).
import { Page } from "@playwright/test";

const PAGE_PATH = "/practice";

export type PracticeMode = "multiple" | "listen" | "combination";

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

  /** 从课程详情页点击第一节课链接，进入该课的练习页。 */
  async clickFirstLesson(): Promise<void> {
    const link = this.page.locator('a[href^="/practice?lessonId="]').first();
    await link.click();
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

  /** 切换到指定练习模式。 */
  async switchMode(mode: PracticeMode): Promise<void> {
    await this.page.click(`[data-action="mode-${mode}"]`);
    await this.page.waitForFunction(
      (m: string) =>
        document
          .querySelector(`[data-action="mode-${m}"]`)
          ?.getAttribute("aria-selected") === "true",
      mode,
      { timeout: 15000 },
    );
  }

  /** 当前题项数（进度条 "Word X of N" 中的 N）。 */
  async totalWords(): Promise<number> {
    const text = await this.page
      .locator('[data-component="QuizProgress"]')
      .innerText();
    const match = text.match(/of (\d+)/);
    return match ? Number(match[1]) : 0;
  }

  async isComplete(): Promise<boolean> {
    return (await this.page.locator('[data-component="QuizComplete"]').count()) > 0;
  }

  /** 点一次正确选项 → 等反馈 → 点 Next；返回是否已进入完成页。 */
  async answerCorrectOnce(): Promise<boolean> {
    const correct = this.page.locator('button[data-answer-correct="true"]').first();
    await correct.click();
    // 等待反馈区出现（判定已发生）。
    await this.page.waitForSelector('[data-component="QuizFeedback"]', {
      timeout: 15000,
    });
    await this.page.click('[data-action="quiz-next"]');
    // 等待进入下一题（反馈消失）或完成页。
    await this.page
      .waitForFunction(
        () =>
          !!document.querySelector('[data-component="QuizComplete"]') ||
          !document.querySelector('[data-component="QuizFeedback"]'),
        undefined,
        { timeout: 15000 },
      )
      .catch(() => {});
    return this.isComplete();
  }

  /** 连续全对作答直到完成页（带最大步数保护）。 */
  async answerAllCorrectly(maxSteps = 50): Promise<void> {
    for (let i = 0; i < maxSteps; i++) {
      if (await this.isComplete()) return;
      const done = await this.answerCorrectOnce();
      if (done) return;
    }
    if (!(await this.isComplete())) {
      throw new Error("practice did not reach completion after maxSteps");
    }
  }
}
