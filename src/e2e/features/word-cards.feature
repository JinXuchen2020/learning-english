Feature: AI word cards review
  As a parent or reviewer
  I want to generate AI word cards from an interest and approve them
  So that safe, relevant vocabulary can enter the word library

  Scenario: A signed-in user generates word cards and approves one
    Given I am logged in as a new user
    When I open the word cards page
    And I enter interest "动物" into the generator
    And I click the word card generate button
    Then I should see at least 1 pending word card
    When I approve the first pending word card
    Then the approved word card should have status "approved"
