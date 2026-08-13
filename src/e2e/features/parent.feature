Feature: Parent approvals (no PIN gate)
  As a parent
  I want to open the parent control panel directly and approve my child's reward redemptions
  So that children cannot access parent controls without a parent account

  Scenario: Parent approves a child's pending redemption
    Given I am logged in as a new user
    When I complete the first daily task
    And I open the rewards store
    And I redeem the reward "集贴纸一枚"
    Then I should see my redemption status "pending"
    When I am logged in as a new parent
    And I open the parent panel
    Then I should be in the parent panel
    And I should see at least 1 pending approval
    When I approve the first pending approval
