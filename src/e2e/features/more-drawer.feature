Feature: More drawer (AI-709)
  As a child using the app on a phone
  I want a "更多" tab that opens a grid of secondary pages
  So that I can reach features like chat, study plan, word cards and speaking practice

  Scenario: Child opens the more drawer and sees the secondary pages (AI-709)
    Given I am logged in as a new user
    When I open the more drawer
    Then the more drawer should show 4 cards

  Scenario: Child enters chat from the more drawer (AI-709)
    Given I am logged in as a new user
    When I open the more drawer
    And I tap the more-drawer card for "chat"
    Then the more drawer should be closed
