Feature: Parent mode (AI-702)
  As a parent
  I want a PIN-locked panel to approve my child's reward redemptions and manage settings
  So that children cannot access parent controls

  Scenario: Parent sets up a PIN for the first time and approves a redemption
    Given I am logged in as a new user
    When I complete the first daily task
    And I open the rewards store
    And I redeem the reward "集贴纸一枚"
    Then I should see my redemption status "pending"
    When I open the parent panel
    Then I should see the parent PIN gate
    When I set up the parent PIN "1234"
    Then I should be in the parent panel
    And I should see at least 1 pending approval
    When I approve the first pending approval
    And I open the rewards store
    Then I should see my redemption status "approved"

  Scenario: After exiting, a wrong PIN is rejected and the correct PIN enters the panel
    Given I am logged in as a new user
    When I open the parent panel
    Then I should see the parent PIN gate
    When I set up the parent PIN "1234"
    Then I should be in the parent panel
    When I exit the parent mode
    Then I should see the parent PIN gate
    When I enter the parent PIN "0000"
    Then I should see a PIN error
    And I should still see the parent PIN gate
    When I enter the parent PIN "1234"
    Then I should be in the parent panel
