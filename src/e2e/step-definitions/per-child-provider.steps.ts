// Per-child AI provider override steps (AI-711).
// UI 交互全部通过 ParentPage page object（下拉按 data-value 选择，断言用
// ChildItem 的 data-child-override 属性，语言无关）。Given/When 的 API 调用
// 直接打 /api，与后端契约一致。
import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import ParentPage from "../support/pages/parent";
import type E2EWorld from "../support/world";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

function parentPage(world: E2EWorld): ParentPage {
  return new ParentPage(world.page, world.baseUrl);
}

/** 从 localStorage 取当前登录家长的 JWT（Given/When 步骤调 API 时用）。 */
async function getParentToken(world: E2EWorld): Promise<string> {
  const token = await world.page.evaluate(() =>
    window.localStorage.getItem("le_auth_token"),
  );
  if (!token) {
    throw new Error("Parent JWT not found in localStorage");
  }
  return token;
}

/**
 * 创建一条 openai-compatible provider 配置（AI-713 起已无 mock 类型），返回其 id。
 * 这里只用于 per-child 绑定的「配置存在性」前置，不会真正调用该 provider 的 AI 能力，
 * 因此用占位 baseUrl / apiKey 即可（归属校验只看配置是否在本家长名下）。
 */
const E2E_PROVIDER_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
const E2E_PROVIDER_API_KEY = "sk-e2e-placeholder-not-a-real-key";
async function createProviderConfig(
  token: string,
  name: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/provider-config`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name,
      type: "openai-compatible",
      baseUrl: E2E_PROVIDER_BASE_URL,
      apiKey: E2E_PROVIDER_API_KEY,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Create provider config failed: ${res.status} ${await res.text()}`,
    );
  }
  const view = (await res.json()) as { id: string };
  return view.id;
}

/** 按昵称找到孩子 id（GET /parent/children 后匹配 nickname）。 */
async function getChildId(
  world: E2EWorld,
  nickname: string,
): Promise<string> {
  const token = await getParentToken(world);
  const res = await fetch(`${API_BASE}/parent/children`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`List children failed: ${res.status} ${await res.text()}`);
  }
  const list = (await res.json()) as { id: string; nickname: string }[];
  const found = list.find((c) => c.nickname === nickname);
  if (!found) {
    throw new Error(`Child with nickname "${nickname}" not found`);
  }
  return found.id;
}

/** 找到场景中创建的 provider 配置 id（按 name）。 */
function configId(world: E2EWorld, name: string): string {
  const cfg = world.providerConfigs.find((c) => c.name === name);
  if (!cfg) {
    throw new Error(`Provider config "${name}" was not created in this scenario`);
  }
  return cfg.id;
}

/* ----------------------------------------------------------------------- */
/* Given: create 2 provider configs                                        */
/* ----------------------------------------------------------------------- */

Given(
  "I have created 2 AI provider configs {string} and {string}",
  async function (this: E2EWorld, nameA: string, nameB: string) {
    const token = await getParentToken(this);
    const idA = await createProviderConfig(token, nameA);
    const idB = await createProviderConfig(token, nameB);
    this.providerConfigs = [
      { name: nameA, id: idA },
      { name: nameB, id: idB },
    ];
  },
);

/* ----------------------------------------------------------------------- */
/* Given: assign a child's provider via API (setup)                        */
/* ----------------------------------------------------------------------- */

Given(
  "the child {string} is assigned provider {string}",
  async function (this: E2EWorld, nickname: string, providerName: string) {
    const token = await getParentToken(this);
    const childId = await getChildId(this, nickname);
    const providerId = configId(this, providerName);
    const res = await fetch(
      `${API_BASE}/parent/children/${childId}/provider`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ providerConfigId: providerId }),
      },
    );
    if (!res.ok) {
      throw new Error(
        `Assign child provider failed: ${res.status} ${await res.text()}`,
      );
    }
    this.assignStatus = res.status;
  },
);

/* ----------------------------------------------------------------------- */
/* When: assign / clear a child's provider via the UI dropdown             */
/* ----------------------------------------------------------------------- */

When(
  "I assign the child {string} to provider {string}",
  async function (this: E2EWorld, nickname: string, providerName: string) {
    const providerId = configId(this, providerName);
    await parentPage(this).selectChildProviderByValue(nickname, providerId);
  },
);

When(
  "I clear the child {string} provider override",
  async function (this: E2EWorld, nickname: string) {
    // 下拉首项（value=""）即「沿用家长默认」
    await parentPage(this).selectChildProviderByValue(nickname, "");
  },
);

/* ----------------------------------------------------------------------- */
/* When: attempt an ownership-violating assignment (expect 403)            */
/* ----------------------------------------------------------------------- */

When(
  "I try to assign the child {string} to provider config id {string}",
  async function (this: E2EWorld, nickname: string, providerId: string) {
    const token = await getParentToken(this);
    const childId = await getChildId(this, nickname);
    const res = await fetch(
      `${API_BASE}/parent/children/${childId}/provider`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ providerConfigId: providerId }),
      },
    );
    this.assignStatus = res.status;
  },
);

/* ----------------------------------------------------------------------- */
/* Then: dropdown badge / override assertions                              */
/* ----------------------------------------------------------------------- */

Then(
  'the child {string} should show the "use parent default" badge',
  async function (this: E2EWorld, nickname: string) {
    await parentPage(this).expectChildOverride(nickname, "");
  },
);

Then(
  "the child {string} should show the override badge for {string}",
  async function (this: E2EWorld, nickname: string, providerName: string) {
    const providerId = configId(this, providerName);
    await parentPage(this).expectChildOverride(nickname, providerId);
  },
);

Then(
  "the assignment should be rejected with status {int}",
  async function (this: E2EWorld, status: number) {
    assert.strictEqual(
      this.assignStatus,
      status,
      `Expected assignment status ${status}, got ${this.assignStatus}`,
    );
  },
);
