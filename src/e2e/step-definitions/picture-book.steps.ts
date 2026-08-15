// AI picture book steps (AI-604).
import { Then, When } from "@cucumber/cucumber";
import PictureBookPage from "../support/pages/pictureBook";
import type E2EWorld from "../support/world";

Then("I should see the picture book section", async function (this: E2EWorld) {
  const page = new PictureBookPage(this.page, this.baseUrl);
  await page.navigateToSection();
});

When("I click the view sample book button", async function (this: E2EWorld) {
  const page = new PictureBookPage(this.page, this.baseUrl);
  // 封闭示例绘本生成，避免 e2e 依赖外部 AI（CI 不可达时后端调用会挂起超时）。
  await page.mockStory();
  await page.clickViewSample();
});

Then(
  "I should see the picture book modal with a non-empty title and at least one page with non-empty text",
  async function (this: E2EWorld) {
    const page = new PictureBookPage(this.page, this.baseUrl);
    await page.waitForModal();
    const title = await page.bookTitle();
    if (!title || title.length === 0) {
      throw new Error("Expected picture book modal to have a non-empty title");
    }
    const count = await page.pageCount();
    if (count < 1) {
      throw new Error("Expected picture book modal to have at least one page");
    }
    const text = await page.firstPageText();
    if (!text || text.length === 0) {
      throw new Error("Expected the first picture book page to have non-empty text");
    }
  },
);
