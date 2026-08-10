Feature: Language switch (AI-706)
  As a user of the kids English app
  I want to switch the UI language between Chinese and English
  So that both Chinese-speaking and English-speaking families can use it

  Scenario: The app redirects to the default Chinese locale
    Given I open the app root
    Then the URL should contain "/zh"

  Scenario: A signed-in user can switch the UI to English (AI-706)
    Given I am logged in as a new user
    When I switch the UI language to "en"
    Then the URL should contain "/en"
    And I should see the greeting containing "I'm Foxy!"

  Scenario: The locale prefix persists when navigating via the tab bar (AI-706)
    Given I am logged in as a new user
    When I switch the UI language to "en"
    And I click the nav link to "chat"
    Then the URL should contain "/en/chat"
