Feature: Plan wizard
  As a signed-in child
  I want to fill in a learning-plan wizard
  So that Foxy can generate a study plan for me

  Scenario: A signed-in child opens the plan wizard and sees all selectors with a disabled generate button
    Given I am logged in as a new user
    When I open the plan wizard
    Then I should see the plan wizard heading
    And I should see 4 age range options
    And I should see 3 level options
    And I should see 4 daily-minute options
    And I should see 8 interest options
    And I should see 4 week options
    And the generate button should be disabled

  Scenario: A signed-in child fills the wizard and submits, then sees a generated plan
    Given I am logged in as a new user
    When I open the plan wizard
    And I select age range "6-8"
    And I select level "a1"
    And I select daily minutes "20"
    And I toggle interest "动物"
    And I select weeks "2"
    Then the generate button should be enabled
    When I click the generate button
    Then I should see the plan preview with at least 1 week
