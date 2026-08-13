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
  // 计数渲染在 SectionTitle 的 Badge（第二个 <span>）里，标题 span 不含 X/Y；
  // 故遍历 h2 下所有 span，取匹配 X/Y 的那个，避免依赖 DOM 位置（#3/#4 历史失败根因）。
  const m = expected.match(/(\d+)\s*\/\s*(\d+)/);
  const wantX = m ? Number(m[1]) : null;
  const wantY = m ? Number(m[2]) : null;
  await this.page.waitForFunction(
    (arr: (number | null)[]) => {
      const [x, y] = arr;
      const spans = document.querySelectorAll('[data-component="DailyTasks"] h2 span');
      for (const span of Array.from(spans)) {
        const got = (span.textContent || "").match(/(\d+)\s*\/\s*(\d+)/);
        if (got && Number(got[1]) === x && Number(got[2]) === y) return true;
      }
      return false;
    },
    [wantX, wantY],
    { timeout: 10000 }
  );
});
