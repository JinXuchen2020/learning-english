// Shared helpers: unique test-user generation and the "log in as new user" flow.
import LoginPage from "./pages/login";
import HomePage from "./pages/home";
import type { Page } from "@playwright/test";
import type { TestUser } from "./world";

// Generate a collision-free username so repeated runs never hit a 409.
export function makeUser(): TestUser {
  const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1000);
  return {
    username: `kid_${suffix}`,
    password: "Passw0rd!23",
    nickname: "Tester",
  };
}

// Register a brand-new user via the UI and wait until the home dashboard loads.
// Returns the credentials so later steps (e.g. a real login) can reuse them.
export async function loginAsNewUser(page: Page, baseUrl: string): Promise<TestUser> {
  const user = makeUser();
  const login = new LoginPage(page, baseUrl);
  await login.open();
  await login.register(user.username, user.password, user.nickname);
  const home = new HomePage(page, baseUrl);
  await home.waitLoaded();
  return user;
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
export async function loginAsNewParent(page: Page, baseUrl: string): Promise<TestUser> {
  const user = makeParentUser();
  const login = new LoginPage(page, baseUrl);
  await login.open();
  await login.register(user.username, user.password, user.nickname, "parent");
  await page.waitForSelector('[data-component="ParentPanel"]', { timeout: 15000 });
  return user;
}
