Feature: Plan progress write-back and Home completion display (AI-209)
  Applying a plan persists it; completing a plan's daily task writes back
  study_plan_days.isDone, and Home shows a plan completion card that updates.

  Background:
    Given I am logged in as a new user
    Then I should be redirected to the home page

  Scenario: Applying a plan shows the plan completion card on Home
    Given I open the plan wizard
    When I select age range "6-8"
    And I select level "a1"
    And I select daily minutes "20"
    And I toggle interest "动物"
    And I select weeks "2"
    And I click the generate button
    And I click the apply button
    Then I should see the plan applied success message
    When I go back to the home page
    Then I should be on the Home page with daily tasks
    And the plan progress card should be visible
    And the plan progress should show done "0" of total at least "1"

  Scenario: Completing plan tasks updates the plan completion degree
    Given I open the plan wizard
    When I select age range "6-8"
    And I select level "a1"
    And I select daily minutes "20"
    And I toggle interest "动物"
    And I select weeks "2"
    And I click the generate button
    And I click the apply button
    Then I should see the plan applied success message
    When I go back to the home page
    Then I should be on the Home page with daily tasks
    And the plan progress should show done "0" of total at least "1"
    When I complete all daily tasks on Home
    Then the plan progress done count should be greater than "0"
