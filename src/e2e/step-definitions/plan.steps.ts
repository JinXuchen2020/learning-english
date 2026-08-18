// Plan wizard steps (AI-207).
import { Given, When, Then } from "@cucumber/cucumber";
import PlanPage from "../support/pages/plan";
import CoursePage from "../support/pages/course";
import type E2EWorld from "../support/world";

Given("I open the plan wizard", async function (this: E2EWorld) {
  const page = new PlanPage(this.page, this.baseUrl);
  await page.open();
});

Then("I should see the plan wizard heading", async function (this: E2EWorld) {
  const page = new PlanPage(this.page, this.baseUrl);
  const text = await page.headingText();
  // 标题文案随语言变化，改用稳定的 PlanTitle 组件是否存在来判定向导已渲染。
  const count = await this.page.locator('[data-component="PlanTitle"]').count();
  if (count === 0) {
    throw new Error(`Expected the plan wizard heading (data-component=PlanTitle) to be visible but got: "${text}"`);
  }
});

Then("I should see {int} age range options", async function (this: E2EWorld, expected: number) {
  const page = new PlanPage(this.page, this.baseUrl);
  const count = await page.ageRangeCount();
  if (count !== expected) throw new Error(`Expected ${expected} age range options but found ${count}`);
});

Then("I should see {int} level options", async function (this: E2EWorld, expected: number) {
  const page = new PlanPage(this.page, this.baseUrl);
  const count = await page.levelCount();
  if (count !== expected) throw new Error(`Expected ${expected} level options but found ${count}`);
});

Then("I should see {int} daily-minute options", async function (this: E2EWorld, expected: number) {
  const page = new PlanPage(this.page, this.baseUrl);
  const count = await page.dailyMinuteCount();
  if (count !== expected) throw new Error(`Expected ${expected} daily-minute options but found ${count}`);
});

Then("I should see {int} interest options", async function (this: E2EWorld, expected: number) {
  const page = new PlanPage(this.page, this.baseUrl);
  const count = await page.interestCount();
  if (count !== expected) throw new Error(`Expected ${expected} interest options but found ${count}`);
});

Then("I should see {int} week options", async function (this: E2EWorld, expected: number) {
  const page = new PlanPage(this.page, this.baseUrl);
  const count = await page.weekCount();
  if (count !== expected) throw new Error(`Expected ${expected} week options but found ${count}`);
});

Then("the generate button should be disabled", async function (this: E2EWorld) {
  const page = new PlanPage(this.page, this.baseUrl);
  if (!(await page.isGenerateDisabled())) {
    throw new Error("Expected generate button to be disabled on an empty form");
  }
});

Then("the generate button should be enabled", async function (this: E2EWorld) {
  const page = new PlanPage(this.page, this.baseUrl);
  if (await page.isGenerateDisabled()) {
    throw new Error("Expected generate button to be enabled after filling the form");
  }
});

When("I select age range {string}", async function (this: E2EWorld, value: string) {
  await new PlanPage(this.page, this.baseUrl).selectAgeRange(value);
});

When("I select level {string}", async function (this: E2EWorld, value: string) {
  await new PlanPage(this.page, this.baseUrl).selectLevel(value);
});

When("I select daily minutes {string}", async function (this: E2EWorld, value: string) {
  await new PlanPage(this.page, this.baseUrl).selectDailyMinutes(value);
});

When("I toggle interest {string}", async function (this: E2EWorld, value: string) {
  await new PlanPage(this.page, this.baseUrl).toggleInterest(value);
});

When("I select weeks {string}", async function (this: E2EWorld, value: string) {
  await new PlanPage(this.page, this.baseUrl).selectWeeks(value);
});

When("I click the generate button", async function (this: E2EWorld) {
  const page = new PlanPage(this.page, this.baseUrl);
  // 封闭 AI 计划生成，避免 e2e 依赖外部 AI 服务（CI 不可达时必挂）。
  await page.mockGeneratePlan();
  await page.clickGenerate();
});

/* ------------------------- AI-804: streaming generation ------------------------- */

Given(
  "the plan generate stream will return a valid plan",
  async function (this: E2EWorld) {
    await new PlanPage(this.page, this.baseUrl).mockStreamValidPlan();
  }
);

Given(
  "the plan generate stream will fail once then succeed",
  async function (this: E2EWorld) {
    await new PlanPage(this.page, this.baseUrl).mockStreamErrorThenValid();
  }
);

When("I submit the plan generation", async function (this: E2EWorld) {
  await new PlanPage(this.page, this.baseUrl).submitGeneration();
});

Then("I should see the plan stream error", async function (this: E2EWorld) {
  await this.page.waitForSelector('[data-component="PlanStreamError"]', { timeout: 15000 });
});

Then("I should see a retry button", async function (this: E2EWorld) {
  await this.page.waitForSelector('button[data-action="retry-stream"]', { timeout: 15000 });
});

When("I click the retry button", async function (this: E2EWorld) {
  await new PlanPage(this.page, this.baseUrl).clickRetry();
});

Then(
  "I should see the plan preview with at least {int} week",
  async function (this: E2EWorld, expected: number) {
    const page = new PlanPage(this.page, this.baseUrl);
    await page.waitPreview();
    const count = await page.previewWeekCount();
    if (count < expected) {
      throw new Error(`Expected at least ${expected} plan week(s) but found ${count}`);
    }
  }
);

Then(
  "I should see at least {int} plan day card",
  async function (this: E2EWorld, expected: number) {
    const page = new PlanPage(this.page, this.baseUrl);
    await page.waitPreview();
    const count = await page.planDayCardCount();
    if (count < expected) {
      throw new Error(`Expected at least ${expected} plan day card(s) but found ${count}`);
    }
  }
);

Then("the apply button should be visible", async function (this: E2EWorld) {
  const page = new PlanPage(this.page, this.baseUrl);
  if (!(await page.isApplyVisible())) {
    throw new Error("Expected the apply button to be visible");
  }
});

Then("the regenerate button should be visible", async function (this: E2EWorld) {
  const page = new PlanPage(this.page, this.baseUrl);
  if (!(await page.isRegenerateVisible())) {
    throw new Error("Expected the regenerate button to be visible");
  }
});

When("I click the apply button", async function (this: E2EWorld) {
  await new PlanPage(this.page, this.baseUrl).clickApply();
});

Then(
  "I should see the plan applied success message",
  async function (this: E2EWorld) {
    await new PlanPage(this.page, this.baseUrl).waitAppliedSuccess();
  }
);

Then(
  "I should be on the Home page with daily tasks",
  async function (this: E2EWorld) {
    await new PlanPage(this.page, this.baseUrl).waitHomeWithTasks();
  }
);

When(
  "I toggle the plan day {int} as done",
  async function (this: E2EWorld, index: number) {
    await new PlanPage(this.page, this.baseUrl).toggleDay(index);
  }
);

Then(
  "the plan day {int} should be marked done",
  async function (this: E2EWorld, index: number) {
    const done = await new PlanPage(this.page, this.baseUrl).isDayDone(index);
    if (!done) {
      throw new Error(`Expected plan day ${index} to be marked done`);
    }
  }
);

/* ------------------------- AI-801: plan → course ------------------------- */

When(
  "I open the course list and remember the course count",
  async function (this: E2EWorld) {
    const course = new CoursePage(this.page);
    await course.openCourseList(this.baseUrl);
    this.coursesBefore = await course.courseCount();
  }
);

Then(
  "I should see the generate-courses button",
  async function (this: E2EWorld) {
    const visible = await new PlanPage(this.page, this.baseUrl).isGenerateCoursesVisible();
    if (!visible) {
      throw new Error("Expected the generate-courses button to be visible after applying the plan");
    }
  }
);

When(
  "I click the generate-courses button",
  async function (this: E2EWorld) {
    await new PlanPage(this.page, this.baseUrl).clickGenerateCourses();
  }
);

Then(
  "I should be on the course list with at least 1 more course",
  { timeout: 120000 },
  async function (this: E2EWorld) {
    // 后端 generateCoursesForPlan 内部最多 3 次 AI 调用（每次超时 18s），
    // 最坏 ~54s 才落库返回；此处放宽等待，避免击穿 step 超时。
    await this.page.waitForFunction(
      () => /^\/(zh|en)\/course(\/|$)/.test(location.pathname),
      undefined,
      { timeout: 100000 },
    );
    await this.page.waitForSelector('[data-component="CourseList"]', { timeout: 30000 });
    const after = await new CoursePage(this.page).courseCount();
    const before = this.coursesBefore ?? 0;
    if (after < before + 1) {
      throw new Error(
        `Expected at least ${before + 1} courses after generating, but found ${after}`,
      );
    }
  }
);
