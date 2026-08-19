Feature: Plan display and interaction (AI-208)
  The /plan wizard (AI-207) gains a colorized weekly plan view plus
  "重新生成" and "应用此计划" actions, and single-day check-off.
  Applying the plan persists it; the child stays on /plan (AI-801) and
  can go back to Home via the go-home button.

  Background:
    Given I am logged in as a new user
    Then I should be redirected to the home page

  Scenario: Generated plan shows colorized weekly cards with apply and regenerate actions
    Given I open the plan wizard
    When I select age range "6-8"
    And I select level "a1"
    And I select daily minutes "20"
    And I toggle interest "动物"
    And I select weeks "2"
    And I click the generate button
    Then I should see the plan preview with at least 1 week
    And I should see at least 1 plan day card
    And the apply button should be visible
    And the regenerate button should be visible

  Scenario: Applying the plan keeps the child on /plan with a go-home path to daily tasks
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

  Scenario: A single plan day can be checked off
    Given I open the plan wizard
    When I select age range "6-8"
    And I select level "a1"
    And I select daily minutes "20"
    And I toggle interest "动物"
    And I select weeks "2"
    And I click the generate button
    And I toggle the plan day 0 as done
    Then the plan day 0 should be marked done
