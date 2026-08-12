// AI-706: language switch (next-intl [locale] routing) step definitions.
import { Given, Then, When } from "@cucumber/cucumber";
import type E2EWorld from "../support/world";

Given("I open the app root", async function (this: E2EWorld) {
  await this.page.goto(this.baseUrl + "/", { waitUntil: "domcontentloaded" });
});

Then("the URL should contain {string}", async function (this: E2EWorld, fragment: string) {
  const url = this.page.url();
  if (!url.includes(fragment)) {
    throw new Error(`Expected URL to contain "${fragment}" but got "${url}"`);
  }
});

When("I switch the UI language to {string}", async function (this: E2EWorld, locale: string) {
  // LocaleSwitcher 内每个语言一个按钮，文案即语言代码（zh=中文 / en=EN）。
  const label = locale === "en" ? "EN" : "中文";
  const btn = this.page
    .locator(`[data-component="LocaleSwitcher"] button:has-text("${label}")`)
    .first();
  await btn.click();
  // 等待客户端路由切换完成（URL 带上 locale 前缀）。
  await this.page.waitForFunction(
    (loc: string) => window.location.pathname.startsWith("/" + loc),
    locale,
    { timeout: 10000 },
  );
});

When("I click the nav link to {string}", async function (this: E2EWorld, path: string) {
  // home/course/practice/rewards 在主 TabNav；chat/plan/word-cards/speech 已移入
  // 「更多」抽屉。优先匹配 TabNav 链接，找不到则开抽屉点 MoreDrawerCard（href 含片段，与语言无关）。
  const tabLink = this.page
    .locator(`[data-component="TabNav"] a[href*="/${path}"]`)
    .first();
  if (await tabLink.count()) {
    await tabLink.click();
  } else {
    const moreBtn = this.page
      .locator('[data-component="TabNav"] button[aria-haspopup="dialog"]')
      .first();
    await moreBtn.click();
    await this.page
      .locator('[data-component="MoreDrawer"]')
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
    await this.page
      .locator(`a[data-component="MoreDrawerCard"][href*="${path}"]`)
      .first()
      .click();
  }
  await this.page.waitForLoadState("networkidle").catch(() => {});
  // 导航到目标路由（带 locale 前缀），例如 /zh/chat。
  await this.page.waitForFunction(
    (r: string) => window.location.pathname.includes("/" + r),
    path,
    { timeout: 10000 },
  );
});
