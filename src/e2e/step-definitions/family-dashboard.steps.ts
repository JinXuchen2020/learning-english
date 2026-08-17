// Family dashboard (AI-712) step definitions.
// 约定：Given 步骤可直接调 API（不走 UI 建数据），When/Then 走 UI + 语言无关断言。
import { Given, When, Then } from "@cucumber/cucumber";
import FamilyDashboardPage from "../support/pages/family-dashboard";
import LoginPage from "../support/pages/login";
import { makeUser, makeParentUser } from "../support/helpers";
import { seedWeakWord } from "../support/seed";
import type E2EWorld from "../support/world";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

function dashPage(world: E2EWorld): FamilyDashboardPage {
  return new FamilyDashboardPage(world.page, world.baseUrl);
}

/**
 * 导航到家长「概览」页（/parent）。与「I open the parent panel」不同——后者进入
 * 控制面板（/parent/settings），而家庭总览（FamilyDashboard）只在概览页渲染。
 */
When("I open the parent overview", async function (this: E2EWorld) {
  await dashPage(this).open();
});

/** 从 localStorage 取当前登录 JWT（Given/When 步骤调 API 时用）。 */
async function getToken(world: E2EWorld): Promise<string> {
  const token = await world.page.evaluate(() =>
    window.localStorage.getItem("le_auth_token"),
  );
  if (!token) {
    throw new Error("JWT not found in localStorage");
  }
  return token;
}

/** 在已建孩子列表中按昵称查找（未找到即抛错，明确指向场景数据问题）。 */
function findChild(
  world: E2EWorld,
  nickname: string,
): { nickname: string; username: string; password: string; id: string } {
  const c = world.createdChildren.find((x) => x.nickname === nickname);
  if (!c) {
    throw new Error(`No created child with nickname "${nickname}"`);
  }
  return c;
}

/* ----------------------------------------------------------------------- */
/* Given: create a child via API (parent already logged in)                */
/* ----------------------------------------------------------------------- */

Given(
  "I create a child named {string} via the API",
  async function (this: E2EWorld, nickname: string) {
    const token = await getToken(this);
    const child = makeUser();
    child.nickname = nickname;
    const res = await fetch(`${API_BASE}/parent/children`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        nickname,
        username: child.username,
        password: child.password,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Create child via API failed: ${res.status} ${await res.text()}`,
      );
    }
    const view = (await res.json()) as { id: string };
    this.createdChildren.push({
      nickname,
      username: child.username,
      password: child.password,
      id: view.id,
    });
  },
);

/* ----------------------------------------------------------------------- */
/* Given: seed a weak word for a specific child (deterministic weakWords)   */
/* ----------------------------------------------------------------------- */

Given(
  "the child {string} has a weak word {string}",
  async function (this: E2EWorld, nickname: string, word: string) {
    const child = findChild(this, nickname);
    // seedWeakWord 用孩子凭据登录后写入 word_progress 错次 → 详情弱项出现。
    await seedWeakWord(child, word);
  },
);

/* ----------------------------------------------------------------------- */
/* When: open a dashboard card → child detail                              */
/* ----------------------------------------------------------------------- */

When(
  "I open the dashboard card for child {string}",
  async function (this: E2EWorld, nickname: string) {
    const child = findChild(this, nickname);
    await dashPage(this).openCard(child.id);
  },
);

When("I go back to the dashboard", async function (this: E2EWorld) {
  await dashPage(this).clickBackToDashboard();
});

/* ----------------------------------------------------------------------- */
/* When: log in as a specific child (to generate activity / stars)          */
/* ----------------------------------------------------------------------- */

When(
  "I log in as the child named {string}",
  async function (this: E2EWorld, nickname: string) {
    const child = findChild(this, nickname);
    // 仅切登录态，不动 this.testUser（仍为家长），供后续「以注册用户登录」回家长。
    const login = new LoginPage(this.page, this.baseUrl);
    await login.login(child.username, child.password);
  },
);

/* ----------------------------------------------------------------------- */
/* When: cross-parent attack — request another family's child detail        */
/* ----------------------------------------------------------------------- */

When(
  "I request the progress of child {string} via the API",
  async function (this: E2EWorld, nickname: string) {
    const child = findChild(this, nickname);
    const token = await getToken(this); // 当前登录的「另一家长」JWT
    const res = await fetch(
      `${API_BASE}/parent/children/${child.id}/progress`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    this.lastApiStatus = res.status;
  },
);

/* ----------------------------------------------------------------------- */
/* Then: dashboard + cards                                                 */
/* ----------------------------------------------------------------------- */

Then("I should see the family dashboard", async function (this: E2EWorld) {
  await dashPage(this).waitForFamilyDashboard();
});

Then(
  "I should see a dashboard card for child {string}",
  async function (this: E2EWorld, nickname: string) {
    const child = findChild(this, nickname);
    await dashPage(this).waitForCardById(child.id);
  },
);

Then(
  "I should be on the child progress detail page for {string}",
  async function (this: E2EWorld, nickname: string) {
    await dashPage(this).assertDetailForChild(nickname);
  },
);

Then("I should see the weak words section", async function (this: E2EWorld) {
  await dashPage(this).waitForWeakWordsSection();
});

Then("I should see the skill mastery section", async function (this: E2EWorld) {
  await dashPage(this).waitForSkillMasterySection();
});

Then(
  "I should see the weekly trend with {int} bars",
  async function (this: E2EWorld, count: number) {
    await dashPage(this).waitForWeeklyTrendBars(count);
  },
);

Then(
  "I should see at least {int} weak word item",
  async function (this: E2EWorld, min: number) {
    await dashPage(this).waitForWeakWordItems(min);
  },
);

Then(
  "I should see a weak word item for {string}",
  async function (this: E2EWorld, word: string) {
    await dashPage(this).waitForWeakWordItem(word);
  },
);

Then(
  "I should see the weak words empty state",
  async function (this: E2EWorld) {
    await dashPage(this).waitForWeakWordsEmpty();
  },
);

Then(
  "I should see a dashboard card for child {string} with more stars than child {string}",
  async function (this: E2EWorld, nickA: string, nickB: string) {
    const a = findChild(this, nickA);
    const b = findChild(this, nickB);
    // 概览页卡片是异步 getDashboard 拉取后渲染，必须先等卡片出现再读星数，
    // 否则卡片未挂载 → getCardStars 返回 -1（AI-712 预存 flaky）。
    await dashPage(this).waitForCardById(a.id);
    await dashPage(this).waitForCardById(b.id);
    const starsA = await dashPage(this).getCardStars(a.id);
    const starsB = await dashPage(this).getCardStars(b.id);
    if (starsA < 0 || starsB < 0) {
      throw new Error(
        `Could not read star counts (${nickA}=${starsA}, ${nickB}=${starsB})`,
      );
    }
    if (!(starsA > starsB)) {
      throw new Error(
        `Expected ${nickA} stars (${starsA}) > ${nickB} stars (${starsB})`,
      );
    }
  },
);

Then(
  "the API responds with status {int}",
  async function (this: E2EWorld, expected: number) {
    if (this.lastApiStatus === null) {
      throw new Error("No API request was recorded (lastApiStatus is null)");
    }
    if (this.lastApiStatus !== expected) {
      throw new Error(
        `Expected API status ${expected} but got ${this.lastApiStatus}`,
      );
    }
  },
);
