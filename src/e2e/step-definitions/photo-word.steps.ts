// AI photo-word (OCR) steps (AI-606).
import path from "path";
import { When, Then } from "@cucumber/cucumber";
import ScanPage from "../support/pages/scan";
import type E2EWorld from "../support/world";

const FIXTURE = path.join(__dirname, "..", "fixtures", "scan-test.png");

When("I open the photo-word page", async function (this: E2EWorld) {
  const page = new ScanPage(this.page, this.baseUrl);
  await page.navigate();
});

When("I upload a test image", async function (this: E2EWorld) {
  const page = new ScanPage(this.page, this.baseUrl);
  await page.uploadTestImage(FIXTURE);
});

When("I click the scan button", async function (this: E2EWorld) {
  const page = new ScanPage(this.page, this.baseUrl);
  // 封闭视觉识别 + 确认 + 生词本拉取，避免 e2e 依赖外部视觉 AI。
  await page.mockRecognize();
  await page.clickScan();
});

Then(
  "I should see at least 1 recognized word card",
  async function (this: E2EWorld) {
    const page = new ScanPage(this.page, this.baseUrl);
    await page.waitForCards();
    this.scanWords = page.lastWords; // 跨 step 共享
  },
);

When("I click add all to vocab book", async function (this: E2EWorld) {
  const page = new ScanPage(this.page, this.baseUrl);
  await page.clickAddAll();
});

Then(
  "my vocab book should contain a recognized word",
  async function (this: E2EWorld) {
    const page = new ScanPage(this.page, this.baseUrl);
    await page.vocabContainsWord(this.scanWords);
  },
);
