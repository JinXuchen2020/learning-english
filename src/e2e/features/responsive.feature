Feature: Responsive layout (AI-708)
  As a parent or child using the app on a phone
  I want the layout to stay readable and not overflow horizontally
  So that I can use it comfortably on a narrow screen without the floating language switcher covering content

  Scenario: No horizontal overflow and language switcher visible at 375px (AI-708)
    Given I am logged in as a new user
    When I set the viewport to 375 by 667
    Then the page should not overflow horizontally
    And the LocaleSwitcher should be visible

  Scenario: No horizontal overflow at 320px extreme viewport (AI-708)
    Given I am logged in as a new user
    When I set the viewport to 320 by 568
    Then the page should not overflow horizontally
