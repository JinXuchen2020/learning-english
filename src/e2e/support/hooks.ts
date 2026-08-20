// Playwright lifecycle hooks: launch one browser for the whole run,
// open a fresh isolated context+page per scenario (so registrations don't collide).
import { Before, After, AfterAll, BeforeAll, setDefaultTimeout } from "@cucumber/cucumber";
import { chromium, Browser } from "@playwright/test";
import type E2EWorld from "./world";

// Generous step timeout: real browser navigation + backend round-trips can take
// longer than Cucumber's implicit 5s, especially on first navigation. CI's
// bundled Chromium is fast, but this keeps local (Edge) runs from flaking.
setDefaultTimeout(30000);

let browser: Browser;

BeforeAll({ timeout: 60000 }, async function () {
  // Browser channel is configurable so the same harness runs locally (Edge,
  // no Chromium download) and in CI (bundled Chromium on Linux).
  //   - locally:  E2E_BROWSER_CHANNEL unset  -> defaults to "msedge"
  //   - in CI:    E2E_BROWSER_CHANNEL=""       -> no channel -> bundled Chromium
  const envChannel = process.env.E2E_BROWSER_CHANNEL;
  const channel = envChannel !== undefined ? envChannel : "msedge";
  const launchOptions: { args: string[]; channel?: string } = {
    // Headless media: provide a synthetic audio stream and auto-grant mic
    // permission so SpeechRecorder's real getUserMedia/MediaRecorder path works
    // without a physical microphone. Without these, getUserMedia rejects with
    // NotAllowedError and the /speech record step can never reach "recording".
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      // AI-407: allow the fox TTS <audio autoPlay> to actually start in headless
      // Chromium/Edge without a prior user gesture (no real speakers needed).
      "--autoplay-policy=no-user-gesture-required",
    ],
  };
  if (channel) launchOptions.channel = channel;
  browser = await chromium.launch(launchOptions);
});

Before(async function (this: E2EWorld) {
  this.context = await browser.newContext();
  this.page = await this.context.newPage();
  this.page.setDefaultTimeout(15000);
  // Surface client-side failures (CORS blocks, fetch errors, React errors) in
  // the CI log — without this, a 401 that never reaches the UI is invisible.
  this.page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      const text = msg.text();
      // Chromium logs this for every 401 network response; during parent
      // scenarios the JWT held by the app is not attached to Next.js <Link>
      // RSC prefetches, so the browser aborts them (ERR_ABORTED) or the
      // backend rejects a role-switch race with 401. No scenario asserts on
      // these, so they are pure log noise — drop them.
      if (text.startsWith("Failed to load resource: the server responded with a status of 401")) {
        return;
      }
      console.log(`[browser:${type}] ${text}`);
    }
  });
  this.page.on("pageerror", (err: Error) => {
    console.log(`[browser:pageerror] ${err.message}`);
  });
  this.page.on("requestfailed", (req) => {
    // Next.js <Link> auto-prefetches route RSC payloads (?_rsc=...). When the
    // test navigates away before the prefetch finishes, the browser cancels
    // the in-flight request with ERR_ABORTED — normal App Router behavior,
    // never a real failure, so don't pollute the CI log with it.
    if (req.url().includes("_rsc=") && req.failure()?.errorText === "net::ERR_ABORTED") {
      return;
    }
    console.log(`[browser:requestfailed] ${req.method()} ${req.url()} -> ${req.failure()?.errorText}`);
  });
});

After(async function (this: E2EWorld) {
  if (this.page) await this.page.close();
  if (this.context) await this.context.close();
});

AfterAll({ timeout: 60000 }, async function () {
  try {
    if (browser) await browser.close();
  } catch (e) {
    console.error("browser close warning:", (e as Error).message);
  }
});
