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
    # 用格式合法（v4 UUID）但本家长并不拥有的 id：让 DTO 校验通过，
    # 真正走到归属校验 —— 后端对「配置不归属本家长」抛 ForbiddenException → 403。
    # （若用 "nonexistent-id" 这类非法 UUID，会在 DTO 校验阶段被拦成 400。）
    When I try to assign the child "小狐" to provider config id "d4e5f607-1234-4abc-8def-0123456789ab"
    Then the assignment should be rejected with status 403
