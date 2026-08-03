// Page object for the course screen (src/app/course/page.tsx).
// List view: data-component="CourseList"; detail view: data-component="CourseDetail"
// with data-component="LessonList" containing the lesson rows.
class CoursePage {
  constructor(page) {
    this.page = page;
  }

  async waitDetail() {
    await this.page.waitForSelector('[data-component="CourseDetail"]');
    await this.page.waitForSelector('[data-component="LessonList"]');
  }

  async lessonCount() {
    // Lesson rows are the direct children of the .space-y-3 container inside LessonList.
    return this.page.locator('[data-component="LessonList"] .space-y-3 > *').count();
  }
}

module.exports = { CoursePage };
