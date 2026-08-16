// Family binding steps (AI-710).
// 约定：UI 交互全部通过 ParentPage page object，断言用 waitForFunction。
// Given 步骤可直接调 API（不走 UI），When/Then 走 UI。
import { Given, When, Then } from "@cucumber/cucumber";
import ParentPage from "../support/pages/parent";
import type E2EWorld from "../support/world";
import { makeUser, makeParentUser } from "../support/helpers";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

function parentPage(world: E2EWorld): ParentPage {
  return new ParentPage(world.page, world.baseUrl);
}

/** 从 localStorage 取当前登录家长的 JWT（Given 步骤调 API 时用）。 */
async function getParentToken(world: E2EWorld): Promise<string> {
  const token = await world.page.evaluate(() =>
    window.localStorage.getItem("le_auth_token"),
  );
  if (!token) {
    throw new Error("Parent JWT not found in localStorage");
  }
  return token;
}

/** 通过 API 注册一个临时家长并返回其 JWT（用于创建可被认领的孤儿孩子）。 */
async function registerTempParent(): Promise<string> {
  const temp = makeParentUser();
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: temp.username,
      password: temp.password,
      nickname: temp.nickname,
    }),
  });
  if (!res.ok) {
    throw new Error(`Temp parent register failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return body.accessToken as string;
}

/* ----------------------------------------------------------------------- */
/* Then: children section visible                                          */
/* ----------------------------------------------------------------------- */

Then("I should see the children section", async function (this: E2EWorld) {
  await parentPage(this).waitForChildrenSection();
});

/* ----------------------------------------------------------------------- */
/* When: create a child via UI                                             */
/* ----------------------------------------------------------------------- */

When(
  "I create a child account with nickname {string}",
  async function (this: E2EWorld, nickname: string) {
    const child = makeUser();
    child.nickname = nickname;
    this.childCredentials = child;

    const p = parentPage(this);
    await p.clickAddChild();
    // 默认就是 create tab，但显式切换以防其他场景改过状态
    await p.clickCreateTab();
    await p.fillCreateChildForm(nickname, child.username, child.password);
    await p.submitChildForm();
  },
);

/* ----------------------------------------------------------------------- */
/* Then: child item visible / gone                                         */
/* ----------------------------------------------------------------------- */

Then(
  "I should see a child item with nickname {string}",
  async function (this: E2EWorld, nickname: string) {
    await parentPage(this).waitForChildItem(nickname);
  },
);

Then(
  "I should not see a child item with nickname {string}",
  async function (this: E2EWorld, nickname: string) {
    await parentPage(this).waitForChildItemGone(nickname);
  },
);

/* ----------------------------------------------------------------------- */
/* Given: create a child via API (parent already logged in)                */
/* ----------------------------------------------------------------------- */

Given(
  "I have created a child account with nickname {string}",
  async function (this: E2EWorld, nickname: string) {
    const token = await getParentToken(this);
    const child = makeUser();
    child.nickname = nickname;
    this.childCredentials = child;

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
  },
);

/* ----------------------------------------------------------------------- */
/* Given: a claimable child exists (created by a temp parent, then unlinked) */
/* ----------------------------------------------------------------------- */

Given(
  "a child account exists with nickname {string}",
  async function (this: E2EWorld, nickname: string) {
    // 1. 注册一个临时家长拿 JWT
    const tempToken = await registerTempParent();

    // 2. 用临时家长创建孩子
    const child = makeUser();
    child.nickname = nickname;
    this.childCredentials = child;

    const createRes = await fetch(`${API_BASE}/parent/children`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tempToken}`,
      },
      body: JSON.stringify({
        nickname,
        username: child.username,
        password: child.password,
      }),
    });
    if (!createRes.ok) {
      throw new Error(
        `Create child via temp parent failed: ${createRes.status} ${await createRes.text()}`,
      );
    }
    const childView = (await createRes.json()) as { id: string };

    // 3. 解除绑定，使孩子 parentId=null（可被当前家长认领）
    const unlinkRes = await fetch(
      `${API_BASE}/parent/children/${childView.id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tempToken}` },
      },
    );
    if (!unlinkRes.ok) {
      throw new Error(
        `Unlink child via temp parent failed: ${unlinkRes.status} ${await unlinkRes.text()}`,
      );
    }
  },
);

/* ----------------------------------------------------------------------- */
/* When: claim a child via UI                                              */
/* ----------------------------------------------------------------------- */

When(
  "I claim the child with nickname {string}",
  async function (this: E2EWorld, _nickname: string) {
    // 使用 Given 步骤存储的孩子凭据
    if (!this.childCredentials) {
      throw new Error("No child credentials stored — run a 'child account exists' step first");
    }
    const { username, password } = this.childCredentials;

    const p = parentPage(this);
    await p.clickAddChild();
    await p.clickClaimTab();
    await p.fillClaimChildForm(username, password);
    await p.submitChildForm();
  },
);

/* ----------------------------------------------------------------------- */
/* When: unlink a child via UI                                             */
/* ----------------------------------------------------------------------- */

When(
  "I unlink the child with nickname {string}",
  async function (this: E2EWorld, nickname: string) {
    const p = parentPage(this);
    await p.unlinkChild(nickname);
    await p.waitForChildItemGone(nickname);
  },
);
