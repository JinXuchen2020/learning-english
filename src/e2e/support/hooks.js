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
  // Surface client-side failures (CORS blocks, fetch errors, React errors) in
  // the CI log — without this, a 401 that never reaches the UI is invisible.
  this.page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      console.log(`[browser:${type}] ${msg.text()}`);
    }
  });
  this.page.on("pageerror", (err) => {
    console.log(`[browser:pageerror] ${err.message}`);
  });
  this.page.on("requestfailed", (req) => {
    console.log(`[browser:requestfailed] ${req.method()} ${req.url()} -> ${req.failure()?.errorText}`);
  });
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
