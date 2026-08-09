Feature: AI difficulty adaptation
  As a returning learner
  I want my practiced words to show an adaptive difficulty badge on the practice page
  So that I can see which words the system thinks are easy, medium, or hard for me

  Scenario: A returning user sees adaptive difficulty badges on free practice
    Given I am logged in as a new user
    And the practice page has practiced words with difficulty data
    When I open the practice page
    Then I should see at least 1 word card with a difficulty badge
