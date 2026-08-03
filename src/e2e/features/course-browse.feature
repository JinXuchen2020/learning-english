Feature: Course browsing
  As a signed-in child
  I want to open a course and see its lessons
  So that I can pick what to learn

  Scenario: A child opens a course to see its lessons
    Given I am logged in as a new user
    When I click the first course card
    Then I should see the course detail with a lesson list
    And I should see at least 1 lesson
