// Page object for the course screen (src/app/course/page.tsx).
// List view: data-component="CourseList"; detail view: data-component="CourseDetail"
// with data-component="LessonList" containing the lesson rows.
import { Page } from "@playwright/test";

export default class CoursePage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async waitDetail(): Promise<void> {
    await this.page.waitForSelector('[data-component="CourseDetail"]');
    await this.page.waitForSelector('[data-component="LessonList"]');
  }

  async lessonCount(): Promise<number> {
    // Lesson rows are the direct children of the .space-y-3 container inside LessonList.
    return this.page.locator('[data-component="LessonList"] .space-y-3 > *').count();
  }

  /** Navigate to the course list (locale-agnostic; middleware adds the prefix) and
   *  wait until it has mounted (post data-load, so cards are present). */
  async openCourseList(baseUrl: string): Promise<void> {
    await this.page.goto(`${baseUrl}/course`);
    await this.page.waitForSelector('[data-component="CourseList"]', { timeout: 30000 });
  }

  /** Number of course cards currently rendered in the list (each card is an <a>). */
  async courseCount(): Promise<number> {
    return this.page.locator('[data-component="CourseList"] a').count();
  }
}
