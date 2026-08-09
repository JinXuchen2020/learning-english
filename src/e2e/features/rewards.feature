Feature: Rewards store and parent approval (AI-701)
  As a signed-in child
  I want to earn points from learning and redeem them for rewards with parent approval
  So that learning feels rewarding and parents stay in control

  Scenario: A child earns points and redeems a reward for parent approval
    Given I am logged in as a new user
    When I complete the first daily task
    And I open the rewards store
    Then I should see at least 1 reward
    And I should see my points balance at least 1
    When I redeem the reward "集贴纸一枚"
    Then I should see my redemption status "pending"
    When the parent approves my redemption
    Then I should see my redemption status "approved"

  Scenario: A child accumulates points by completing a daily task (AI-701)
    Given I am logged in as a new user
    When I complete the first daily task
    And I open the rewards store
    Then I should see my points balance at least 1
    And I should see the level ring
