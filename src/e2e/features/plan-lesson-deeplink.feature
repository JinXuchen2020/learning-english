Feature: Plan lesson deep-links on Home (AI-803)
  When a daily task carries a real lesson reference (lessonId), the Home
  dashboard renders a "go learn" deep link that navigates to the matching
  practice (or speech) page instead of completing the task inline. This closes
  the loop between a learning plan and the real course/lesson catalog.

  Background:
    Given I am logged in as a new user

  Scenario: A vocab lesson-referenced daily task deep-links to the practice page
    Given the daily tasks endpoint returns a lesson-referenced task with skill "vocab"
    When I open the home dashboard
    Then I should see at least 1 daily task with a lesson deep link
    When I tap the first lesson deep link
    Then I should land on the practice page with the lesson id

  Scenario: A speak lesson-referenced daily task deep-links to the speech page
    Given the daily tasks endpoint returns a lesson-referenced task with skill "speak"
    When I open the home dashboard
    Then I should see at least 1 daily task with a lesson deep link
    When I tap the first lesson deep link
    Then I should land on the speech page with the task id
