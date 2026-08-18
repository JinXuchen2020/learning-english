// Chat page steps (AI-407).
import { Given, When, Then } from "@cucumber/cucumber";
import ChatPage from "../support/pages/chat";
import type E2EWorld from "../support/world";

const STUB_SCENES = [
  {
    id: "greeting",
    title: "打招呼",
    openingLine: "Hello! I am Foxy. What is your name?",
    targetVocabulary: ["hello", "hi", "name", "fine"],
  },
  {
    id: "zoo",
    title: "动物园",
    openingLine: "Let's go to the zoo! What animal do you see?",
    targetVocabulary: ["cat", "dog", "bird", "rabbit"],
  },
];

// A real, valid (silent) WAV data URI so the <audio autoPlay> element can
// actually start decoding/playing in headless Chromium (an invalid base64
// mp3 would stay paused and fail the auto-play assertion).
const FOX_VOICE_WAV =
  "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

Given("the chat scenes are stubbed with {int} scenes", async function (this: E2EWorld, count: number) {
  const page = new ChatPage(this.page, this.baseUrl);
  await page.mockScenes(STUB_SCENES.slice(0, count));
});

Given(
  "the chat reply will be {string} with a fox voice",
  async function (this: E2EWorld, reply: string) {
    const page = new ChatPage(this.page, this.baseUrl);
    // A deterministic, valid fox voice (WAV data URI) so the auto-play assertion is stable.
    await page.mockChatReply(reply, FOX_VOICE_WAV);
  },
);

Given(
  "the chat reply is the safety fallback {string}",
  async function (this: E2EWorld, reply: string) {
    const page = new ChatPage(this.page, this.baseUrl);
    await page.mockChatSafetyFallback(reply);
  },
);

// AI-408：模拟「完成 N 轮得星」——第 round 次调用 messages 端点时返回 starAwarded。
Given(
  "the chat reply will be {string} with a fox voice and awards a star on round {int}",
  async function (this: E2EWorld, reply: string, round: number) {
    const page = new ChatPage(this.page, this.baseUrl);
    await page.mockChatReply(reply, FOX_VOICE_WAV, {
      awardOnRound: round,
      starStars: 1,
      starsUntilNext: 8,
    });
  },
);

Given(
  "the read-along evaluation will return a passing score",
  async function (this: E2EWorld) {
    const page = new ChatPage(this.page, this.baseUrl);
    await page.mockEvaluate(92, true, "good", "cheer");
  },
);

When("I open the chat page", async function (this: E2EWorld) {
  const page = new ChatPage(this.page, this.baseUrl);
  await page.open();
});

Then("I should see the chat heading", async function (this: E2EWorld) {
  // 语言无关：标题文案随 locale 变化（zh「和小狐狸聊天！」/ en「Chat with Foxy!」），
  // 不判文案，只断言标题容器可见（data-component 稳定）。
  await this.page
    .locator('[data-component="ChatTitle"]')
    .first()
    .waitFor({ state: "visible", timeout: 15000 });
});

Then(
  "I should see at least {int} scene card",
  async function (this: E2EWorld, expected: number) {
    const page = new ChatPage(this.page, this.baseUrl);
    const count = await page.sceneCardCount();
    if (count < expected) {
      throw new Error(`Expected at least ${expected} scene card(s) but found ${count}`);
    }
  },
);

Then("I should see a chat input", async function (this: E2EWorld) {
  const page = new ChatPage(this.page, this.baseUrl);
  if ((await this.page.locator('[data-component="ChatInput"]').count()) === 0) {
    throw new Error("Expected a chat input");
  }
});

When("I select the scene {string}", async function (this: E2EWorld, title: string) {
  const page = new ChatPage(this.page, this.baseUrl);
  await page.selectScene(title);
});

Then("I should see a fox opening bubble", async function (this: E2EWorld) {
  const page = new ChatPage(this.page, this.baseUrl);
  if (!(await page.isOpeningBubbleVisible())) {
    throw new Error("Expected a fox opening bubble after selecting a scene");
  }
});

Then("I should see the goal words", async function (this: E2EWorld) {
  const page = new ChatPage(this.page, this.baseUrl);
  if (!(await page.isVocabVisible())) {
    throw new Error("Expected the goal words (SceneVocab) to be visible");
  }
});

When(
  "I type {string} into the chat input",
  async function (this: E2EWorld, text: string) {
    const page = new ChatPage(this.page, this.baseUrl);
    await page.typeMessage(text);
  },
);

When("I send the chat message", async function (this: E2EWorld) {
  const page = new ChatPage(this.page, this.baseUrl);
  // 发送前先数已有的「狐狸回复」气泡（data-opening=false，开场种子气泡不算）。
  // 多轮对话时 .first() 会误判（已有回复气泡存在即瞬间 resolve），故改为等待
  // 第 before 个（即本次新生成的）回复气泡出现，避免与下一断言发生竞态。
  const replySel = '[data-component="ChatBubble"][data-role="assistant"][data-opening="false"]';
  const before = await this.page.locator(replySel).count();
  await page.clickSend();
  await this.page.locator(replySel).nth(before).waitFor({ timeout: 15000 });
});

Then(
  "I should see {int} user bubble(s)",
  async function (this: E2EWorld, expected: number) {
    const page = new ChatPage(this.page, this.baseUrl);
    const count = await page.userBubbleCount();
    if (count !== expected) {
      throw new Error(`Expected ${expected} user bubble(s) but found ${count}`);
    }
  },
);

Then(
  "I should see {int} fox reply bubble(s)",
  async function (this: E2EWorld, expected: number) {
    const page = new ChatPage(this.page, this.baseUrl);
    const count = await page.assistantBubbleCount();
    if (count !== expected) {
      throw new Error(`Expected ${expected} fox reply bubble(s) but found ${count}`);
    }
  },
);

Then("I should see a TTS audio bar", async function (this: E2EWorld) {
  const page = new ChatPage(this.page, this.baseUrl);
  if ((await page.ttsAudioCount()) < 1) {
    throw new Error("Expected a TTS audio bar on the fox reply");
  }
});

Then("the fox voice should auto-play", async function (this: E2EWorld) {
  const page = new ChatPage(this.page, this.baseUrl);
  const src = await page.ttsAudioSrc();
  if (!src || !src.startsWith("data:audio/wav;base64,")) {
    throw new Error(`Expected the fox TTS audio src to be the mocked fox voice, got: "${src}"`);
  }
  if (!(await page.isTtsAutoplaying())) {
    throw new Error("Expected the fox voice audio to auto-play");
  }
});

When(
  "I click read-along on the first fox reply",
  async function (this: E2EWorld) {
    const page = new ChatPage(this.page, this.baseUrl);
    await page.clickReadAlong(0);
  },
);

When("I record my read-along voice", async function (this: E2EWorld) {
  const page = new ChatPage(this.page, this.baseUrl);
  await page.recordReadAlong();
});

When("I submit the read-along", async function (this: E2EWorld) {
  const page = new ChatPage(this.page, this.baseUrl);
  await page.submitReadAlong();
  await page.waitReadAlongFeedback();
});

Then("I should see the read-along feedback", async function (this: E2EWorld) {
  const page = new ChatPage(this.page, this.baseUrl);
  if (
    (await this.page.locator('[data-component="ReadAlongFeedback"]').count()) === 0
  ) {
    throw new Error("Expected the read-along feedback panel");
  }
});

Then("I should see a read-along star earned", async function (this: E2EWorld) {
  const page = new ChatPage(this.page, this.baseUrl);
  if (!(await page.isReadAlongStarVisible())) {
    throw new Error("Expected a star earned on a passing read-along score");
  }
});

Then(
  "the fox reply should say {string}",
  async function (this: E2EWorld, expected: string) {
    const page = new ChatPage(this.page, this.baseUrl);
    const count = await page.assistantBubbleCount();
    let found = false;
    for (let i = 0; i < count; i++) {
      const text = await page.assistantBubbleText(i);
      if (text && text.includes(expected)) {
        found = true;
        break;
      }
    }
    if (!found) {
      throw new Error(`Expected a fox reply containing "${expected}"`);
    }
  },
);

// AI-408：连续对话 N 轮（mock 后端，不发真实请求），用于触发「第 N 轮得星」里程碑。
When(
  "I chat for {int} rounds saying {string}",
  async function (this: E2EWorld, rounds: number, text: string) {
    const page = new ChatPage(this.page, this.baseUrl);
    const replySel =
      '[data-component="ChatBubble"][data-role="assistant"][data-opening="false"]';
    for (let i = 0; i < rounds; i++) {
      const before = await this.page.locator(replySel).count();
      await page.typeMessage(text);
      await page.clickSend();
      await this.page
        .locator(replySel)
        .nth(before)
        .waitFor({ timeout: 15000 });
    }
  },
);

Then("I should see a star celebration", async function (this: E2EWorld) {
  const page = new ChatPage(this.page, this.baseUrl);
  if (!(await page.isStarCelebrationVisible())) {
    throw new Error("Expected a star celebration banner after earning a chat star");
  }
});

Then(
  "I should see a chat star count of {int}",
  async function (this: E2EWorld, expected: number) {
    const page = new ChatPage(this.page, this.baseUrl);
    const text = await page.starCountText();
    if (!text || Number(text) !== expected) {
      throw new Error(`Expected chat star count of ${expected} but got "${text}"`);
    }
  },
);

// ---- AI-409：会话历史与续聊 ----

Given(
  "the chat sessions endpoint returns a session {string} in scene {string} with {int} star(s)",
  async function (this: E2EWorld, id: string, sceneId: string, stars: number) {
    const page = new ChatPage(this.page, this.baseUrl);
    await page.mockChatSessions([
      {
        id,
        sceneId,
        stars,
        messageCount: 0,
        lastMessagePreview: null,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      },
    ]);
  },
);

Given(
  "the chat session {string} has history: the user said {string} and the fox said {string}",
  async function (this: E2EWorld, id: string, userText: string, foxText: string) {
    const page = new ChatPage(this.page, this.baseUrl);
    await page.mockChatSessionMessages(id, [
      { id: `${id}-m1`, role: "user", text: userText },
      { id: `${id}-m2`, role: "assistant", text: foxText },
    ]);
  },
);

When(
  "I resume the chat session {string}",
  async function (this: E2EWorld, id: string) {
    const page = new ChatPage(this.page, this.baseUrl);
    await page.clickSession(id);
  },
);

Then(
  "I should see {int} chat session item(s)",
  async function (this: E2EWorld, expected: number) {
    const page = new ChatPage(this.page, this.baseUrl);
    // 等待第 expected 个会话项出现（证明列表已加载且至少这么多），再精确计数。
    await this.page
      .locator('[data-component="ChatSessionItem"]')
      .nth(expected - 1)
      .waitFor({ timeout: 10000 });
    const count = await page.sessionItemCount();
    if (count !== expected) {
      throw new Error(`Expected ${expected} chat session item(s) but found ${count}`);
    }
  },
);

Then(
  "I should see a chat bubble containing {string}",
  async function (this: E2EWorld, text: string) {
    const page = new ChatPage(this.page, this.baseUrl);
    try {
      await this.page
        .locator('[data-component="ChatBubble"]', { hasText: text })
        .first()
        .waitFor({ timeout: 10000 });
    } catch {
      const found = await page.chatMessageContains(text);
      if (!found) {
        throw new Error(`Expected a chat bubble containing "${text}"`);
      }
    }
  },
);

When("I start a new chat", async function (this: E2EWorld) {
  const page = new ChatPage(this.page, this.baseUrl);
  await page.clickNewChat();
});

Then("I should see an empty chat thread", async function (this: E2EWorld) {
  try {
    await this.page
      .locator('[data-component="ChatEmpty"]')
      .waitFor({ timeout: 10000 });
  } catch {
    throw new Error("Expected an empty chat thread (ChatEmpty)");
  }
});

// ---- AI-802：语音听写 ----

Given(
  "the speech recognition will return {string}",
  async function (this: E2EWorld, text: string) {
    this.speechFinal = text;
  },
);

Given("speech recognition is unsupported", async function (this: E2EWorld) {
  // 标记为不支持路径：open 时不注入 fake SpeechRecognition（模拟 Firefox / 非安全上下文）。
  this.speechFinal = null;
});

When(
  "I open the chat page without speech recognition",
  async function (this: E2EWorld) {
    const page = new ChatPage(this.page, this.baseUrl);
    await page.open({ speechRecognition: false });
  },
);

When("I click the voice input button", async function (this: E2EWorld) {
  const page = new ChatPage(this.page, this.baseUrl);
  // 点击前把罐头最终文本注入运行时（FakeSpeechRecognition 在 start() 时读取）。
  if (this.speechFinal) {
    await page.setSpeechFinal(this.speechFinal);
  }
  await page.clickVoiceInput();
});

Then("I should see the voice input button", async function (this: E2EWorld) {
  const page = new ChatPage(this.page, this.baseUrl);
  if (!(await page.isVoiceButtonVisible())) {
    throw new Error("Expected a voice input (mic) button on the chat page");
  }
});

Then(
  "the voice input should be listening",
  async function (this: E2EWorld) {
    const page = new ChatPage(this.page, this.baseUrl);
    if (!(await page.isVoiceListening())) {
      throw new Error("Expected the voice input to be in listening state");
    }
  },
);

Then(
  "the chat input should contain {string}",
  async function (this: E2EWorld, text: string) {
    try {
      // 识别回调异步写入 input，轮询等待以避免竞态。
      await this.page.waitForFunction(
        (t) => {
          const el = document.querySelector(
            '[data-component="ChatInput"]',
          ) as HTMLTextAreaElement | null;
          return !!el && el.value.includes(t);
        },
        text,
        { timeout: 10000 },
      );
    } catch {
      const page = new ChatPage(this.page, this.baseUrl);
      const value = await page.inputText();
      throw new Error(
        `Expected the chat input to contain "${text}" but got "${value}"`,
      );
    }
  },
);

Then(
  "the voice input button should be disabled",
  async function (this: E2EWorld) {
    const page = new ChatPage(this.page, this.baseUrl);
    if (!(await page.isVoiceButtonDisabled())) {
      throw new Error(
        "Expected the voice input button to be disabled when speech recognition is unsupported",
      );
    }
  },
);
