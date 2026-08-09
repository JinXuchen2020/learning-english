Feature: Practice quiz variants (listen-pick-image and combination)
  As a signed-in child
  I want to practice words in different quiz modes
  So that I can learn through listening and color-word combinations

  Scenario: Listen-and-pick-image mode can be answered to completion
    Given I am logged in as a new user
    When I click the first course card
    And I click the first lesson
    Then I should see the practice page
    When I switch to listen practice mode
    Then I should see the listen prompt
    When I answer all questions correctly
    Then I should see the practice completion screen

  Scenario: Color-combination mode can be answered to completion
    Given I am logged in as a new user
    When I click the first course card
    And I click the first lesson
    Then I should see the practice page
    When I switch to combination practice mode
    Then I should see the combination prompt
    When I answer all questions correctly
    Then I should see the practice completion screen
