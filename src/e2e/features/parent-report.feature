Feature: Parent weekly report dashboard
  As a parent (or guardian viewing the child's progress)
  I want a weekly dashboard with learning trends, weak-word Top10, and AI suggestions
  So that I can understand my child's week at a glance and help with weak words

  Scenario: A signed-in user views the weekly report with trend chart, weak words and suggestions (AI-507)
    Given the weekly report preview endpoint returns a report with weak words "Cat,Dog" and suggestions "多练习发音,复习颜色词"
    And I am logged in as a new user
    When I open the parent report page
    Then I should see the trend chart
    And I should see 6 metric cards
    And I should see the weak words "Cat" and "Dog"
    And I should see the suggestion "多练习发音"

  Scenario: A parent can drill down from a weak word to its practice page (AI-507)
    Given the weekly report preview endpoint returns a report with weak words "Cat,Dog" and suggestions "多练习发音"
    And I am logged in as a new user
    When I open the parent report page
    And I click the weak word "Cat"
    Then I should land on the practice page focused on "Cat"

  Scenario: A parent can navigate to the previous week (AI-507)
    Given the weekly report preview endpoint returns a report with weak words "Cat,Dog" and suggestions "多练习发音"
    And I am logged in as a new user
    When I open the parent report page
    And I click the previous week button
    Then I should see the week label containing "2026-07-27"
