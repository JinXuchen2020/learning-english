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
 *  a deterministic belt-and-suspenders so the recording produces a fixed blob. */
function fakeMicrophoneScript(): void {
  const fakeStream = {
    getTracks: () => [{ stop: () => {} }],
    getAudioTracks: () => [{ stop: () => {} }],
    getVideoTracks: () => [],
  } as unknown as MediaStream;
  const fakeGetUserMedia = async (): Promise<MediaStream> => fakeStream;

  const defineOrAssign = (target: any, key: string, value: unknown) => {
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
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    static isTypeSupported(_t: string): boolean {
      return true;
    }
    constructor(_stream: MediaStream) {
      this.state = "inactive";
    }
    start(): void {
      this.state = "recording";
    }
    stop(): void {
      this.state = "inactive";
      const blob = new Blob([new Uint8Array(1024)], { type: "audio/webm" });
      if (this.ondataavailable) this.ondataavailable({ data: blob });
      if (this.onstop) this.onstop();
    }
  }

  defineOrAssign(window, "MediaRecorder", FakeMediaRecorder);
}

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

    // Navigate via the TabNav "Speak" link (client-side) so the in-memory auth
    // token survives — a full page.goto('/speech') would reset module memory
    // and bounce to /login via AuthGate.
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
    await recorder.locator('button[aria-label="Tap to record"]').click();
    await this.page
      .locator('[data-component="SpeechRecorder"][data-status="recording"]')
      .waitFor({ timeout: 10000 });
    await recorder.locator('button[aria-label="Stop recording"]').click();
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
}
