Feature: Parent AI provider configuration (AI-705)
  As a parent
  I want to configure alternative AI providers (OpenAI-compatible / BigModel) with encrypted keys
  So that my child's AI features can use a provider I choose, instead of only the system default

  Scenario: Parent adds an OpenAI-compatible provider, sets it default, and removes it
    Given I am logged in as a new parent
    When I open the parent panel
    Then I should be in the parent panel
    And I should see the AI provider config section
    When I add an OpenAI-compatible provider named "演示通道" with base url "https://api.test/v1" and api key "sk-secret1234"
    Then I should see a provider config item named "演示通道"
    When I set the provider config "演示通道" as default
    Then the provider config "演示通道" should be marked default
    When I delete the provider config "演示通道"
    Then I should not see the provider config "演示通道"

  Scenario: Parent adds an OpenAI-compatible provider, sees the masked key, and removes it
    Given I am logged in as a new parent
    When I open the parent panel
    Then I should be in the parent panel
    And I should see the AI provider config section
    When I add an OpenAI-compatible provider named "我的智谱" with base url "https://api.test/v1" and api key "sk-secret1234"
    Then I should see a provider config item named "我的智谱"
    And the provider config "我的智谱" should show a masked key
    When I delete the provider config "我的智谱"
    Then I should not see the provider config "我的智谱"
