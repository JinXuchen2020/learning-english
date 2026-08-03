// Page object for the home dashboard (src/app/page.tsx, wrapped by AuthGate).
// Key regions carry data-component hooks: Home / GreetingBanner / DailyTasks / CourseProgress.
class HomePage {
  constructor(page, baseUrl) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  // Wait until the dashboard is mounted AND its data (courses) has loaded,
  // so assertions don't race the initial loading spinner.
  async waitLoaded() {
    await this.page.waitForSelector('[data-component="Home"]');
    await this.page.waitForSelector('[data-component="CourseProgress"] a');
  }

  async greetingText() {
    return (await this.page.locator('[data-component="GreetingBanner"]').textContent())?.trim();
  }

  async courseCount() {
    return this.page.locator('[data-component="CourseProgress"] a').count();
  }

  async taskCount() {
    return this.page.locator('[data-component="DailyTasks"] button').count();
  }

  async completedCountText() {
    return (await this.page.locator('[data-component="DailyTasks"] h2 span').first().textContent())?.trim();
  }

  async clickFirstCourse() {
    await this.page.locator('[data-component="CourseProgress"] a').first().click();
  }

  async completeFirstTask() {
    const btn = this.page.locator('[data-component="DailyTasks"] button').first();
    await btn.click();
    // Optimistic UI flips aria-pressed immediately; wait for it.
    await this.page.waitForFunction(() => {
      const el = document.querySelector('[data-component="DailyTasks"] button');
      return el && el.getAttribute("aria-pressed") === "true";
    });
  }

  async isFirstTaskCompleted() {
    const pressed = await this.page
      .locator('[data-component="DailyTasks"] button')
      .first()
      .getAttribute("aria-pressed");
    return pressed === "true";
  }
}

module.exports = { HomePage };
