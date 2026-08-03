// Playwright lifecycle hooks: launch one browser for the whole run,
// open a fresh isolated context+page per scenario (so registrations don't collide).
const { Before, After, AfterAll, BeforeAll } = require("@cucumber/cucumber");
const { chromium } = require("@playwright/test");

let browser;

BeforeAll({ timeout: 60000 }, async function () {
  // Browser channel is configurable so the same harness runs locally (Edge,
  // no Chromium download) and in CI (bundled Chromium on Linux).
  //   - locally:  E2E_BROWSER_CHANNEL unset  -> defaults to "msedge"
  //   - in CI:    E2E_BROWSER_CHANNEL=""       -> no channel -> bundled Chromium
  const envChannel = process.env.E2E_BROWSER_CHANNEL;
  const channel = envChannel !== undefined ? envChannel : "msedge";
  const launchOptions = { args: ["--no-sandbox", "--disable-dev-shm-usage"] };
  if (channel) launchOptions.channel = channel;
  browser = await chromium.launch(launchOptions);
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
