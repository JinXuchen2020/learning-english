Feature: Home dashboard
  As a signed-in child
  I want to see my courses and daily tasks on the home page
  So that I know what to learn today

  Scenario: A signed-in child sees courses and daily tasks
    Given I am logged in as a new user
    Then I should see the greeting containing "I'm Foxy!"
    And I should see 3 course cards
    And I should see 3 daily tasks

  Scenario: A child sees their earned chat stars on the home dashboard (AI-408)
    Given the chat stars endpoint returns 3 stars
    And I am logged in as a new user
    Then I should see the chat stars card with 3
