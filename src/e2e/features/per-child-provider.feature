Feature: Per-child AI provider override (AI-711)
  As a parent
  I want to assign each child their own AI provider (or fall back to my default)
  So that my children can use different providers independently

  Scenario: Parent assigns a provider to a child and sees the override badge
    Given I am logged in as a new parent
    And I have created 2 AI provider configs "通道A" and "通道B"
    And I have created a child account with nickname "小狐"
    When I open the parent panel
    Then I should see the children section
    And the child "小狐" should show the "use parent default" badge
    When I assign the child "小狐" to provider "通道A"
    Then the child "小狐" should show the override badge for "通道A"

  Scenario: Parent reverts a child to the parent default
    Given I am logged in as a new parent
    And I have created 2 AI provider configs "通道A" and "通道B"
    And I have created a child account with nickname "小狐"
    And the child "小狐" is assigned provider "通道A"
    When I open the parent panel
    And the child "小狐" should show the override badge for "通道A"
    When I clear the child "小狐" provider override
    Then the child "小狐" should show the "use parent default" badge

  Scenario: Parent cannot assign a child to a provider they do not own
    Given I am logged in as a new parent
    And I have created a child account with nickname "小狐"
    When I try to assign the child "小狐" to provider config id "nonexistent-id"
    Then the assignment should be rejected with status 403
