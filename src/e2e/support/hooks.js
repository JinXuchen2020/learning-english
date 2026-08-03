// Playwright lifecycle hooks: launch one browser for the whole run,
// open a fresh isolated context+page per scenario (so registrations don't collide).
const { Before, After, AfterAll, BeforeAll } = require("@cucumber/cucumber");
const { chromium } = require("@playwright/test");

let browser;

BeforeAll({ timeout: 60000 }, async function () {
  // Use the system-installed Microsoft Edge instead of a downloaded Chromium
  // build (channel: 'msedge' launches the local Edge via CDP). Avoids the
  // ~150MB Chromium download and works offline.
  browser = await chromium.launch({
    channel: "msedge",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
});

Before(async function () {
  this.context = await browser.newContext();
  this.page = await this.context.newPage();
  this.page.setDefaultTimeout(15000);
});

After(async function () {
  if (this.page) await this.page.close();
  if (this.context) await this.context.close();
});

AfterAll({ timeout: 60000 }, async function () {
  try {
    if (browser) await browser.close();
  } catch (e) {
    console.error("browser close warning:", e.message);
  }
});
