// Page object for the chat page (src/app/chat/page.tsx, wrapped by AuthGate).
// Key regions carry data-component hooks: ChatPage / SceneCards / SceneCard /
// SceneVocab / ChatThread / ChatBubble / ChatTtsAudio / ChatInput / ChatComposer /
// ReadAlongPanel / ReadAlongFeedback.
//
// Recording for the read-along button needs a fake microphone in headless
// browsers, so `open()` injects one via addInitScript (mirrors the speech POM).
import { Locator, Page } from "@playwright/test";

/** Inject a fake microphone + MediaRecorder so SpeechRecorder can run headless.
 *  Uses Object.defineProperty because navigator.mediaDevices/MediaRecorder are
 *  read-only accessors in Chromium — a plain assignment is silently dropped. */
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
        /* best-effort */
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

export default class ChatPage {
  private page: Page;
  private baseUrl: string;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  async open(): Promise<void> {
    // Inject fake mic BEFORE navigation so read-along recordings work headless.
    await this.page.addInitScript(fakeMicrophoneScript);

    // Navigate via the TabNav "Chat" link (client-side) so the in-memory auth
    // token survives — a full page.goto('/chat') would reset module memory
    // and bounce to /login via AuthGate.
    const chatLink = this.page.locator('nav a[href="/chat"]');
    if (await chatLink.count()) {
      await chatLink.first().click();
    } else {
      await this.page.goto(`${this.baseUrl}/chat`);
    }
    await this.page.waitForSelector('[data-component="ChatPage"]', { timeout: 15000 });
  }

  /** Mock the scenes endpoint so the page is deterministic (no backend scene data dependency). */
  async mockScenes(
    scenes: Array<{ id: string; title: string; openingLine: string; targetVocabulary: string[] }>,
  ): Promise<void> {
    await this.page.route("**/api/ai/chat/scenes", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(scenes),
      }),
    );
  }

  /** Mock the chat messages endpoint to return a deterministic fox reply (with optional TTS url). */
  async mockChatReply(replyText: string, ttsUrl: string | null): Promise<void> {
    await this.page.route("**/api/ai/chat/messages", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "sess-1",
          messageId: `msg-${Date.now()}`,
          replyText,
          ttsUrl,
        }),
      }),
    );
  }

  /** Mock the chat endpoint to always return the safety fallback reply (simulates AI-406 interception). */
  async mockChatSafetyFallback(replyText: string): Promise<void> {
    await this.page.route("**/api/ai/chat/messages", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "sess-1",
          messageId: `msg-safe-${Date.now()}`,
          replyText,
          ttsUrl: null,
        }),
      }),
    );
  }

  /** Mock the speech evaluate endpoint (read-along) to return a deterministic result. */
  async mockEvaluate(
    score: number,
    passed: boolean,
    level: string,
    mascotExpr: string,
  ): Promise<void> {
    await this.page.route("**/api/ai/speech/evaluate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          score,
          readableText: "hello",
          weakPhonemes: passed ? [] : ["θ"],
          feedback: passed ? "Great job!" : "Nice try, again!",
          mascotExpr,
          passed,
          level,
        }),
      }),
    );
  }

  sceneCardCount(): Promise<number> {
    return this.page.locator('[data-component="SceneCard"]').count();
  }

  async selectScene(title: string): Promise<void> {
    const card = this.page.locator('[data-component="SceneCard"]', { hasText: title }).first();
    await card.click();
  }

  async isOpeningBubbleVisible(): Promise<boolean> {
    return (
      (await this.page
        .locator('[data-component="ChatBubble"][data-role="assistant"][data-opening="true"]')
        .count()) > 0
    );
  }

  async openingBubbleText(): Promise<string | undefined> {
    return (
      await this.page
        .locator('[data-component="ChatBubble"][data-role="assistant"][data-opening="true"]')
        .textContent()
    )?.trim();
  }

  async isVocabVisible(): Promise<boolean> {
    return (
      (await this.page.locator('[data-component="SceneVocab"]').count()) > 0
    );
  }

  async typeMessage(text: string): Promise<void> {
    await this.page.locator('[data-component="ChatInput"]').fill(text);
  }

  async clickSend(): Promise<void> {
    await this.page.locator('button[data-action="send"]').click();
  }

  assistantBubbleCount(): Promise<number> {
    return this.page
      .locator('[data-component="ChatBubble"][data-role="assistant"]')
      .count();
  }

  async assistantBubbleText(index: number): Promise<string | undefined> {
    return (
      await this.page
        .locator('[data-component="ChatBubble"][data-role="assistant"]')
        .nth(index)
        .textContent()
    )?.trim();
  }

  userBubbleCount(): Promise<number> {
    return this.page
      .locator('[data-component="ChatBubble"][data-role="user"]')
      .count();
  }

  /** Whether a TTS <audio> bar is present for any assistant bubble. */
  async ttsAudioCount(): Promise<number> {
    return this.page.locator('[data-component="ChatTtsAudio"]').count();
  }

  /** src attribute of the first TTS <audio> (for asserting the mocked fox voice url). */
  async ttsAudioSrc(): Promise<string | null> {
    const el = this.page.locator('[data-component="ChatTtsAudio"]').first();
    if ((await el.count()) === 0) return null;
    return (await el.getAttribute("src")) ?? null;
  }

  /** Whether the first TTS audio is actively playing (autoplay worked). */
  async isTtsAutoplaying(): Promise<boolean> {
    try {
      await this.page.waitForFunction(
        () => {
          const el = document.querySelector(
            '[data-component="ChatTtsAudio"]',
          ) as HTMLAudioElement | null;
          return !!el && !el.paused;
        },
        undefined,
        { timeout: 5000 },
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Click the read-along button on the index-th assistant bubble. */
  async clickReadAlong(index: number): Promise<void> {
    const bubble = this.page
      .locator('[data-component="ChatBubble"][data-role="assistant"]')
      .nth(index);
    await bubble.locator('button[data-action="read-along"]').click();
    await this.page.waitForSelector('[data-component="ReadAlongPanel"]', { timeout: 10000 });
  }

  /** Drive the read-along recorder: tap → stop, reaching "recorded". */
  async recordReadAlong(): Promise<void> {
    const panel = this.page.locator('[data-component="ReadAlongPanel"]');
    const recorder = panel.locator('[data-component="SpeechRecorder"]');
    await recorder.locator('button[aria-label="Tap to record"]').click();
    await panel
      .locator('[data-component="SpeechRecorder"][data-status="recording"]')
      .waitFor({ timeout: 10000 });
    await recorder.locator('button[aria-label="Stop recording"]').click();
    await panel
      .locator('[data-component="SpeechRecorder"][data-status="recorded"]')
      .waitFor({ timeout: 10000 });
  }

  async submitReadAlong(): Promise<void> {
    await this.page.locator('button[data-action="submit-readalong"]').click();
  }

  async waitReadAlongFeedback(): Promise<void> {
    await this.page.waitForSelector('[data-component="ReadAlongFeedback"]', {
      timeout: 20000,
    });
  }

  async isReadAlongStarVisible(): Promise<boolean> {
    const text = await this.page
      .locator('[data-component="ReadAlongFeedback"]')
      .textContent();
    return !!text && text.includes("star");
  }
}
