Feature: Family dashboard (AI-712)
  As a parent
  I want to see a progress overview of all my children and drill into each child's detail
  So that I can monitor my family's learning at a glance

  Scenario: Parent views all children as dashboard cards and opens a child detail
    Given I am logged in as a new parent
    And I create a child named "小红" via the API
    And I create a child named "小蓝" via the API
    When I open the parent overview
    Then I should see the family dashboard
    And I should see a dashboard card for child "小红"
    And I should see a dashboard card for child "小蓝"
    When I open the dashboard card for child "小红"
    Then I should be on the child progress detail page for "小红"
    And I should see the weak words section
    And I should see the skill mastery section
    And I should see the weekly trend with 7 bars

  Scenario: Weak words reflect each child's own practice
    Given I am logged in as a new parent
    And I create a child named "小红" via the API
    And I create a child named "小蓝" via the API
    And the child "小红" has a weak word "Cat"
    When I open the parent overview
    When I open the dashboard card for child "小红"
    Then I should see at least 1 weak word item
    And I should see a weak word item for "Cat"
    When I go back to the dashboard
    When I open the dashboard card for child "小蓝"
    Then I should see the weak words empty state

  Scenario: Children with different activity show different star counts
    Given I am logged in as a new parent
    And I create a child named "小红" via the API
    And I create a child named "小蓝" via the API
    When I log in as the child named "小红"
    And I complete the first daily task
    When I log in with the registered user
    And I open the parent overview
    Then I should see a dashboard card for child "小红" with more stars than child "小蓝"

  Scenario: A different parent cannot access another family's child detail
    Given I am logged in as a new parent
    And I create a child named "小宝" via the API
    And I am logged in as a new parent
    When I request the progress of child "小宝" via the API
    Then the API responds with status 404
