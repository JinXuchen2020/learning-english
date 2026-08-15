// Shared helpers: unique test-user generation and the "log in as new user" flow.
import LoginPage from "./pages/login";
import HomePage from "./pages/home";
import type { Page } from "@playwright/test";
import type { TestUser } from "./world";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

// Generate a collision-free username so repeated runs never hit a 409.
export function makeUser(): TestUser {
  const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1000);
  return {
    username: `kid_${suffix}`,
    password: "Passw0rd!23",
    nickname: "Tester",
  };
}

// AI-710: Public registration is parent-only. Children cannot self-register.
// To obtain a child session in E2E, we:
//   1. Register a parent (now the only public registration path)
//   2. Use the parent's JWT to call POST /api/parent/children (create child)
//   3. Log in as the child via the standard sign-in flow
// This mirrors the real UX: a parent creates a child account, then the child
// logs in with those credentials.
export async function loginAsNewUser(
  page: Page,
  baseUrl: string,
): Promise<TestUser> {
  // 1. Register a parent via the UI
  const parent = makeParentUser();
  const login = new LoginPage(page, baseUrl);
  await login.open();
  await login.register(parent.username, parent.password, parent.nickname);
  await page.waitForSelector('[data-component="ParentOverviewPanel"]', {
    timeout: 15000,
  });

  // 2. Extract the parent JWT from localStorage to call the API directly
  const token = await page.evaluate(() =>
    window.localStorage.getItem("le_auth_token"),
  );
  if (!token) throw new Error("Parent JWT not found in localStorage after registration");

  // 3. Create a child account via the parent API
  const child = makeUser();
  const res = await fetch(`${API_BASE}/parent/children`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      nickname: child.nickname,
      username: child.username,
      password: child.password,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Failed to create child via API: ${res.status} ${await res.text()}`,
    );
  }

  // 4. Log in as the child via the UI
  await login.open();
  await login.login(child.username, child.password);
  const home = new HomePage(page, baseUrl);
  await home.waitLoaded();
  return child;
}

// Generate a PARENT test user (AI-710+: registration is parent-only; a parent
// account logs straight into /parent with no PIN gate).
export function makeParentUser(): TestUser {
  const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1000);
  return {
    username: `parent_${suffix}`,
    password: "Passw0rd!23",
    nickname: "TesterParent",
  };
}

// Register a brand-new PARENT user via the UI and wait until the parent panel
// loads. Parent accounts route to /parent (not the child home dashboard), so we
// wait for the panel root instead of the home dashboard.
export async function loginAsNewParent(
  page: Page,
  baseUrl: string,
): Promise<TestUser> {
  const user = makeParentUser();
  const login = new LoginPage(page, baseUrl);
  await login.open();
  await login.register(user.username, user.password, user.nickname);
  await page.waitForSelector('[data-component="ParentOverviewPanel"]', {
    timeout: 15000,
  });
  return user;
}
