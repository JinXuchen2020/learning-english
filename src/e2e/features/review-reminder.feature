Feature: AI review reminder
  As a learner
  I want words I'm about to forget to appear as review tasks
  So that I practice them before they're lost

  Scenario: A due review word appears in today's tasks and opens practice
    Given I am logged in as a new user
    When I seed a due review word "Cat"
    Then I should see the review reminder card with at least 1 word
    And I should see a review task in today's tasks
    When I click the first review word link
    Then I should be on the practice page for "Cat"
