Feature: Family binding (AI-710)
  As a parent
  I want to create and manage child accounts linked to my family
  So that my children can use AI features with my provider configuration

  Scenario: Parent creates a child account and sees it in the list
    Given I am logged in as a new parent
    When I open the parent panel
    Then I should see the children section
    When I create a child account with nickname "小狐狸"
    Then I should see a child item with nickname "小狐狸"

  Scenario: Parent unlinks a child and the list updates
    Given I am logged in as a new parent
    And I have created a child account with nickname "小狸"
    When I open the parent panel
    And I unlink the child with nickname "小狸"
    Then I should not see a child item with nickname "小狸"

  Scenario: Parent claims an existing child by credentials
    Given I am logged in as a new parent
    And a child account exists with nickname "小宝"
    When I open the parent panel
    And I claim the child with nickname "小宝"
    Then I should see a child item with nickname "小宝"
