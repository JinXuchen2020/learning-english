Feature: Daily task completion
  As a signed-in child
  I want to complete a daily task and watch my progress update
  So that I feel a sense of achievement

  Scenario: Completing a daily task updates the progress count
    Given I am logged in as a new user
    When I complete the first daily task
    Then that task should be marked completed
    And the completed count should be "1/3 done"
