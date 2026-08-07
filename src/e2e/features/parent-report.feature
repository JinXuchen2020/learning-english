Feature: Parent report weak-word drill-down
  As a parent
  I want to click a weak word on the report
  So that my child can practice that specific word

  Background:
    Given I am logged in as a new user

  Scenario: Drilling down from a weak word lands on focused practice
    Given the weekly report has a weak word "Cat"
    Given I open the parent report
    Then I should see at least 1 weak word
    When I click the weak word "Cat"
    Then I should land on the practice page focused on "Cat"
