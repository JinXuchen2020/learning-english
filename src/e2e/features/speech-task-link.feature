Feature: Speech task deep-link and completion write-back (AI-308)
  As a child user
  I want to tap a speaking task on Home and practice on the speech page
  So that finishing the session checks off my daily task and writes back progress

  Background:
    Given I am logged in as a new user

  Scenario: Tapping the speaking task opens the speech page with the task id
    When I open the home dashboard
    And I tap the speaking task
    Then I should be on the speech practice page
    And the speech page url should include a task id

  Scenario: Finishing the speech session checks off the speaking task on Home
    When I open the home dashboard
    And I tap the speaking task
    And I complete the speech practice session
    And I return to the home dashboard
    Then the speaking task should be marked completed
    And the completed count should be "1/3 done"

  Scenario: Non-speaking tasks still complete on tap
    When I open the home dashboard
    And I tap the first non-speaking task
    Then that task should be marked completed
