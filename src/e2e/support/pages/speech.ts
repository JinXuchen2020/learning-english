// Page object for the speech practice page (src/app/speech/page.tsx).
// Key regions carry data-component hooks: SpeechPage / SpeechTitle / SpeechCard /
// WordFront / RecordArea / SpeechRecorder / SpeechFeedbackPanel / SpeechCelebration /
// StarCounter / StarCount / SpeechComplete.
//
// Recording is impossible in headless browsers (no real microphone), so `open()`
// injects a fake getUserMedia + fake MediaRecorder via addInitScript. The speech
// evaluate endpoint is mocked per-scenario (mockEvaluate) so the score is
// deterministic and the user journey (听→录→评→反馈→得星) is stable.
import { Locator, Page } from "@playwright/test";

/** Inject a fake microphone + MediaRecorder so SpeechRecorder can run headless.
 *  Uses Object.defineProperty because `navigator.mediaDevices`/`MediaRecorder`
 *  are read-only accessors in Chromium — a plain assignment is silently
 *  dropped, which is exactly why the real getUserMedia then threw
 *  NotAllowedError. The launch flags in hooks.ts are the primary fix; this is
 *  a deterministic belt-and-suspenders so the recording produces a fixed blob.
 *
 *  NOTE: Must stay a STRING, not a function: tsx/esbuild's keepNames transform
 *  injects `__name()` helper calls into function bodies, and Playwright's
 *  addInitScript serializes functions via toString() — a compiled function
 *  would ship a `__name is not defined` ReferenceError into every page and the
 *  fake would never install (AI-802 CI regression). */
const fakeMicrophoneScript = `
const fakeStream = {
  getTracks: () => [{ stop: () => {} }],
  getAudioTracks: () => [{ stop: () => {} }],
  getVideoTracks: () => [],
};
const fakeGetUserMedia = async () => fakeStream;

const defineOrAssign = (target, key, value) => {
  try {
    Object.defineProperty(target, key, {
      configurable: true,
      writable: true,
      value,
    });
  } catch {
    try {
      target[key] = value;
    } catch {
      /* best-effort: launch flags in hooks.ts cover this case */
    }
  }
};

try {
  if (!navigator.mediaDevices) {
    defineOrAssign(navigator, "mediaDevices", {});
  }
  defineOrAssign(navigator.mediaDevices, "getUserMedia", fakeGetUserMedia);
} catch {
  /* best-effort */
}

class FakeMediaRecorder {
  state = "inactive";
  ondataavailable = null;
  onstop = null;
  onerror = null;
  static isTypeSupported() {
    return true;
  }
  constructor() {
    this.state = "inactive";
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    const blob = new Blob([new Uint8Array(1024)], { type: "audio/webm" });
    if (this.ondataavailable) this.ondataavailable({ data: blob });
    if (this.onstop) this.onstop();
  }
}

defineOrAssign(window, "MediaRecorder", FakeMediaRecorder);
`;

export default class SpeechPage {
  private page: Page;
  private baseUrl: string;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  async open(): Promise<void> {
    // Inject fake mic BEFORE the speech page loads (applies to the navigation
    // triggered by the TabNav click below).
    await this.page.addInitScript(fakeMicrophoneScript);

    // /speech 在「更多」抽屉，TabNav 无直链 → link.count() 为 0 → 走整页 goto 兜底。
    // JWT 已镜像到 localStorage，整页 goto 保留登录态（middleware 重定向到默认 locale 前缀）。
    const speakLink = this.page.locator('nav a[href="/speech"]');
    if (await speakLink.count()) {
      await speakLink.first().click();
    } else {
      await this.page.goto(`${this.baseUrl}/speech`);
    }
    await this.page.waitForSelector('[data-component="SpeechPage"]');
  }

  async headingText(): Promise<string | undefined> {
    return (await this.page.locator('[data-component="SpeechTitle"]').textContent())?.trim();
  }

  async wordCardCount(): Promise<number> {
    return this.page.locator('[data-component="WordCard"]').count();
  }

  /** 切到句子模式：点 ModeToggle 的 Sentences 标签，等句子卡片挂载。 */
  async switchToSentences(): Promise<void> {
    await this.page.locator('button[data-action="mode-sentences"]').click();
    await this.page.waitForSelector('[data-component="SentenceCard"]', { timeout: 10000 });
  }

  async sentenceCardCount(): Promise<number> {
    return this.page.locator('[data-component="SentenceCard"]').count();
  }

  async isListenButtonVisible(): Promise<boolean> {
    const btn = this.page.locator('button[data-action="listen"]');
    return (await btn.count()) > 0 && (await btn.first().isVisible());
  }

  async clickListen(): Promise<void> {
    await this.page.locator('button[data-action="listen"]').click();
  }

  /** Click record → stop, driving the (faked) recorder to a "recorded" state. */
  async recordVoice(): Promise<void> {
    const recorder = this.page.locator('[data-component="SpeechRecorder"]');
    // 录音按钮无稳定 data-action，且 aria-label 随语言变化；idle/recording 态下
    // SpeechRecorder 内仅渲染唯一一个按钮，故用 button.first() 定位（与 chat.ts 同口径）。
    await recorder.locator('button').first().click();
    await this.page
      .locator('[data-component="SpeechRecorder"][data-status="recording"]')
      .waitFor({ timeout: 10000 });
    await recorder.locator('button').first().click();
    await this.page
      .locator('[data-component="SpeechRecorder"][data-status="recorded"]')
      .waitFor({ timeout: 10000 });
  }

  async submit(): Promise<void> {
    await this.page.locator('button[data-action="submit-speech"]').click();
  }

  async waitFeedback(): Promise<void> {
    await this.page.waitForSelector('[data-component="SpeechFeedbackPanel"]', {
      timeout: 20000,
    });
  }

  isCelebrationVisible(): Promise<boolean> {
    return this.page
      .locator('[data-component="SpeechCelebration"]')
      .isVisible()
      .catch(() => false);
  }

  async starCount(): Promise<number> {
    const text = (
      await this.page.locator('[data-component="StarCount"]').textContent()
    )?.trim();
    const n = Number(text);
    return Number.isFinite(n) ? n : 0;
  }

  /** Mock the evaluate endpoint to return a deterministic SpeechFeedback. */
  async mockEvaluate(
    score: number,
    passed: boolean,
    level: string,
    mascotExpr: string,
  ): Promise<void> {
    await this.page.route("**/api/ai/speech/evaluate", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          score,
          readableText: "cat",
          weakPhonemes: passed ? [] : ["θ"],
          feedback: passed
            ? "Great job! Your pronunciation is clear."
            : "Nice try! Let's practice the 'th' sound again.",
          mascotExpr,
          passed,
          level,
        }),
      });
    });
  }

  async clickNext(): Promise<void> {
    await this.page.locator('button[data-action="next-word"]').click();
  }

  async waitComplete(): Promise<void> {
    await this.page.waitForSelector('[data-component="SpeechComplete"]', {
      timeout: 20000,
    });
  }

  async clickBackHome(): Promise<void> {
    // 整页 goto 回 Home（token 在 localStorage，登录态保留；
    // SpeechComplete 返回链接 href 带 locale 前缀，直接 goto 最稳）。
    await this.page.goto(`${this.baseUrl}/`);
  }

  /**
   * Drive a full speech practice session to completion: for every word card,
   * record → submit → (feedback appears) → next, looping until the completion
   * screen shows. Relies on the launch flags in hooks.ts for a working
   * headless microphone (real getUserMedia/MediaRecorder), so no fake-mic
   * injection is required here.
   */
  async completeSession(): Promise<void> {
    // Wait until the first word card (or the completion screen) is ready, so we
    // don't race the initial word-loading spinner.
    await this.page
      .waitForSelector('[data-component="WordCard"], [data-component="SpeechComplete"]', {
        timeout: 20000,
      })
      .catch(() => {});
    for (let i = 0; i < 50; i++) {
      if ((await this.page.locator('[data-component="SpeechComplete"]').count()) > 0) {
        // Wait for the linked daily task to be written back (TaskDoneNote) before
        // letting the caller navigate home. completeTask is an async fire-and-forget
        // POST that resolves only after the backend PATCH commits; if we click
        // "Back to Home" first, the Home dashboard refetches getDailyTasks() before
        // the task is marked and the assertion fails. The 10s timeout is a no-op
        // fallback for sessions opened without a ?taskId (no TaskDoneNote rendered).
        await this.page
          .locator('[data-component="TaskDoneNote"]')
          .waitFor({ timeout: 10000 })
          .catch(() => {});
        return;
      }
      if ((await this.page.locator('[data-component="SpeechRecorder"]').count()) > 0) {
        await this.recordVoice();
      }
      const submitBtn = this.page.locator('button[data-action="submit-speech"]');
      if ((await submitBtn.count()) > 0) {
        await submitBtn.click();
        await this.waitFeedback();
      }
      const nextBtn = this.page.locator('button[data-action="next-word"]');
      if ((await nextBtn.count()) > 0) {
        await nextBtn.click();
      } else {
        return;
      }
    }
  }
}
