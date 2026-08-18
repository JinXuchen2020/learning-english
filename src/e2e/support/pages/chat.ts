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

/**
 * Inject a fake SpeechRecognition so the AI-802 voice-input button is
 * `supported=true` in headless Chromium (which has no native Web Speech API).
 * The fake, on start(), delivers a single FINAL result equal to
 * `window.__SPEECH_FINAL__` (default "Hello Foxy") — no real audio needed.
 * It does NOT auto-onend (stays "listening" until stop()), so the E2E can
 * assert the listening state and the transcribed text without a restart loop.
 */
function fakeSpeechRecognitionScript(): void {
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

  class FakeSpeechRecognition {
    lang = "";
    continuous = false;
    interimResults = false;
    maxAlternatives = 1;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    onstart: (() => void) | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;

    start(): void {
      this.timer = setTimeout(() => {
        const finalText =
          (window as unknown as { __SPEECH_FINAL__?: string }).__SPEECH_FINAL__ ||
          "Hello Foxy";
        const result: any = {
          isFinal: true,
          length: 1,
          "0": { transcript: finalText, confidence: 0.9 },
          item(i: number) {
            return this[i];
          },
        };
        const results: any = {
          length: 1,
          "0": result,
          item(i: number) {
            return this[i];
          },
        };
        if (this.onresult) this.onresult({ resultIndex: 0, results });
      }, 0);
    }

    stop(): void {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      if (this.onend) this.onend();
    }

    abort(): void {
      this.stop();
    }
  }

  defineOrAssign(window, "SpeechRecognition", FakeSpeechRecognition);
  defineOrAssign(window, "webkitSpeechRecognition", FakeSpeechRecognition);
}

export default class ChatPage {
  private page: Page;
  private baseUrl: string;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  async open(opts?: { speechRecognition?: boolean }): Promise<void> {
    const injectSpeech = opts?.speechRecognition !== false;
    // Inject fake mic BEFORE navigation so read-along recordings work headless.
    await this.page.addInitScript(fakeMicrophoneScript);
    // AI-802：默认注入 fake SpeechRecognition，使语音输入按钮 supported=true。
    // 传入 { speechRecognition: false } 则不注入（模拟 Firefox / 不支持降级）。
    if (injectSpeech) {
      await this.page.addInitScript(fakeSpeechRecognitionScript);
    }

    // /chat 在「更多」抽屉，TabNav 无直链 → link.count() 为 0 → 走整页 goto 兜底。
    // JWT 已镜像到 localStorage，整页 goto 保留登录态（middleware 重定向到默认 locale 前缀）。
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

  /**
   * Mock the chat messages endpoint to return a deterministic fox reply.
   * 回显请求体中的 `sessionId`（若缺失回落 "sess-1"），便于「续聊」场景断言
   * 会话 id 不漂移。
   * @param replyText 狐狸回复正文
   * @param ttsUrl 朗读音频引用（默认有效 WAV，便于自动播断言）
   * @param opts.awardOnRound 若设置，则第 N 次调用本端点时附加 starAwarded
   *   （模拟后端「完成 N 轮得星」），其余调用返回无星常规响应。
   */
  async mockChatReply(
    replyText: string,
    ttsUrl: string | null,
    opts?: { awardOnRound?: number; starStars?: number; starsUntilNext?: number },
  ): Promise<void> {
    let n = 0;
    await this.page.route("**/api/ai/chat/messages", async (route) => {
      let reqSessionId = "sess-1";
      try {
        const post = route.request().postData();
        if (post) {
          const body = JSON.parse(post) as { sessionId?: string };
          if (body.sessionId) reqSessionId = body.sessionId;
        }
      } catch {
        /* best-effort */
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: reqSessionId,
          messageId: `msg-${Date.now()}-${n}`,
          replyText,
          ttsUrl,
          ...(opts?.awardOnRound && ++n === opts.awardOnRound
            ? {
                stars: opts.starStars ?? 1,
                starAwarded: true,
                starsUntilNext: opts.starsUntilNext ?? 8,
              }
            : { stars: 0, starAwarded: false, starsUntilNext: 8 }),
        }),
      });
    });
  }

  /** Mock the chat stars endpoint (Home 展示)，返回累计星星数。 */
  async mockChatStars(stars: number): Promise<void> {
    await this.page.route("**/api/ai/chat/stars**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ stars }),
      }),
    );
  }

  /** AI-409：Mock 会话列表端点，返回给定摘要数组（按前端期望结构）。
   *  注意末位 `*`，用于匹配带 `?userId=` 查询串的请求 URL（Playwright glob
   *  对完整 URL 含 query 做匹配，缺 `*` 会漏拦截而打到真实后端 → 新用户返回空列表）。 */
  async mockChatSessions(
    sessions: Array<{
      id: string;
      sceneId: string | null;
      stars: number;
      messageCount: number;
      lastMessagePreview: string | null;
      createdAt?: string;
      updatedAt?: string | null;
    }>,
  ): Promise<void> {
    await this.page.route("**/api/ai/chat/sessions*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sessions),
      }),
    );
  }

  /** AI-409：Mock 某会话的历史消息端点，返回给定消息数组（user/assistant）。
   *  末位 `*` 同样用于匹配 `?userId=` 查询串。 */
  async mockChatSessionMessages(
    sessionId: string,
    messages: Array<{ id: string; role: "user" | "assistant"; text: string }>,
  ): Promise<void> {
    await this.page.route(
      `**/api/ai/chat/sessions/${sessionId}/messages*`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(messages),
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
    return this.page.locator('[data-component="ChatTtsAudio"]').count();  }

  /** AI-408：刚得星的庆祝横幅是否可见。 */
  async isStarCelebrationVisible(): Promise<boolean> {
    return (
      (await this.page.locator('[data-component="ChatStarCelebration"]').count()) > 0
    );
  }

  /** AI-408：本会话星星徽标文本（如 "1"）。 */
  async starCountText(): Promise<string | undefined> {
    const el = this.page.locator('[data-component="ChatStarCount"]');
    if ((await el.count()) === 0) return undefined;
    return (await el.textContent())?.trim();
  }

  /** AI-408：Home 的聊天星星卡是否可见。 */
  async isChatStarsCardVisible(): Promise<boolean> {
    return (await this.page.locator('[data-component="ChatStars"]').count()) > 0;
  }

  /** AI-408：Home 聊天星星卡文本（如 "3"）。 */
  async chatStarsText(): Promise<string | undefined> {
    const el = this.page.locator('[data-component="ChatStars"]');
    if ((await el.count()) === 0) return undefined;
    return (await el.textContent())?.trim();
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
    // 录音按钮无稳定 data-action，且 aria-label 随语言变化；idle/recording 态下
    // SpeechRecorder 内仅渲染唯一一个按钮，故用 button.first() 定位（与 speech.ts 同口径）。
    await recorder.locator('button').first().click();
    await panel
      .locator('[data-component="SpeechRecorder"][data-status="recording"]')
      .waitFor({ timeout: 10000 });
    await recorder.locator('button').first().click();
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
    // 得星文案随语言变化（en "star" / zh "星"/"⭐"），用与语言无关的正则判定。
    return !!text && /star|星|⭐/i.test(text);
  }

  /** AI-409：会话列表中的会话项数量（data-component="ChatSessionItem"）。 */
  async sessionItemCount(): Promise<number> {
    return this.page.locator('[data-component="ChatSessionItem"]').count();
  }

  /** AI-409：点击某个历史会话项以续聊（data-session-id 定位）。 */
  async clickSession(sessionId: string): Promise<void> {
    await this.page
      .locator(`[data-component="ChatSessionItem"][data-session-id="${sessionId}"]`)
      .click();
  }

  /** AI-409：点击「+ New chat」按钮（data-action="new-chat"）。 */
  async clickNewChat(): Promise<void> {
    await this.page.locator('button[data-action="new-chat"]').click();
  }

  /** AI-409：整个对话 thread 中（任何角色气泡）是否含某段文本。 */
  async chatMessageContains(text: string): Promise<boolean> {
    const bubbles = this.page.locator('[data-component="ChatBubble"]');
    const n = await bubbles.count();
    for (let i = 0; i < n; i++) {
      const t = await bubbles.nth(i).textContent();
      if (t && t.includes(text)) return true;
    }
    return false;
  }

  // ---- AI-802：语音听写 ----

  /** 设置语音识别的「罐头最终文本」，点击麦克风前生效（运行时注入 window.__SPEECH_FINAL__）。 */
  async setSpeechFinal(text: string): Promise<void> {
    await this.page.evaluate((t) => {
      (window as unknown as { __SPEECH_FINAL__?: string }).__SPEECH_FINAL__ = t;
    }, text);
  }

  /** 麦克风按钮是否可见（supported=true 时渲染）。 */
  async isVoiceButtonVisible(): Promise<boolean> {
    return (
      (await this.page.locator('button[data-action="voice-input"]').count()) > 0
    );
  }

  /** 麦克风按钮是否禁用（不支持时降级为 disabled）。 */
  async isVoiceButtonDisabled(): Promise<boolean> {
    const btn = this.page.locator('button[data-action="voice-input"]');
    if ((await btn.count()) === 0) return false;
    return await btn.isDisabled();
  }

  /** 是否处于 listening 态（data-state="listening"）。 */
  async isVoiceListening(): Promise<boolean> {
    return (
      (await this.page
        .locator('button[data-action="voice-input"][data-state="listening"]')
        .count()) > 0
    );
  }

  async clickVoiceInput(): Promise<void> {
    await this.page.locator('button[data-action="voice-input"]').click();
  }

  /** 输入框当前文本。 */
  async inputText(): Promise<string> {
    return (
      (await this.page.locator('[data-component="ChatInput"]').inputValue()) ??
      ""
    );
  }
}
