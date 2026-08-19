Feature: Plan to course generation
  As a signed-in child who has just applied a learning plan
  I want to generate a matching course derived from that plan
  So that I can keep learning the themes I planned in one tap

  Scenario: A child applies a plan and generates a matching course, then sees it in the course list
    Given I am logged in as a new user
    When I open the course list and remember the course count
    And I open the plan wizard
    And I select age range "6-8"
    And I select level "a1"
    And I select daily minutes "20"
    And I toggle interest "动物"
    And I select weeks "2"
    And I click the generate button
    Then I should see the plan preview with at least 1 week
    When I click the apply button
    Then I should see the plan applied success message
    And I should see the generate-courses button
    When I click the generate-courses button
    Then I should be on the course list with at least 1 more course
