Feature: AI mascot growth story
  As a learner
  I want to see my mascot's level and read a growth story
  So that my learning progress feels rewarding

  Scenario: A new user sees the mascot growth card and can open the growth story
    Given I am logged in as a new user
    Then I should see the mascot growth card
    And the mascot in the growth card should show level 1
    And the mascot growth story is stubbed
    When I click the view growth story button
    Then I should see the mascot story modal with a title and text
