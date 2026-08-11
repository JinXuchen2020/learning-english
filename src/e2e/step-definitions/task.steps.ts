// Daily task completion journey.
import { When, Then } from "@cucumber/cucumber";
import HomePage from "../support/pages/home";
import type E2EWorld from "../support/world";

When("I complete the first daily task", async function (this: E2EWorld) {
  const home = new HomePage(this.page, this.baseUrl);
  await home.completeFirstTask();
});

Then("that task should be marked completed", async function (this: E2EWorld) {
  const home = new HomePage(this.page, this.baseUrl);
  if (!(await home.isFirstTaskCompleted())) {
    throw new Error("First daily task was not marked completed");
  }
});

Then("the completed count should be {string}", async function (this: E2EWorld, expected: string) {
  // 完成度文案随语言变化（如 en "1/3 done" / zh "1/3 已完成"），仅抽取 "X/Y" 数值比对。
  const m = expected.match(/(\d+)\s*\/\s*(\d+)/);
  const wantX = m ? Number(m[1]) : null;
  const wantY = m ? Number(m[2]) : null;
  await this.page.waitForFunction(
    (arr: (number | null)[]) => {
      const [x, y] = arr;
      const span = document.querySelector('[data-component="DailyTasks"] h2 span');
      if (!span) return false;
      const got = (span.textContent || "").match(/(\d+)\s*\/\s*(\d+)/);
      if (!got) return false;
      return Number(got[1]) === x && Number(got[2]) === y;
    },
    [wantX, wantY],
    { timeout: 10000 }
  );
});
