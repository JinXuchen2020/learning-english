Feature: Parent AI provider configuration (AI-705 / AI-714)
  As a parent
  I want to configure alternative AI providers (OpenAI-compatible / BigModel) with encrypted keys
  So that my child's AI features can use a provider I choose, instead of only the system default

  Scenario: Parent adds an OpenAI-compatible provider, sets it default, and removes it
    Given I am logged in as a new parent
    When I open the parent panel
    Then I should be in the parent panel
    And I should see the AI provider config section
    When I add an OpenAI-compatible provider named "演示通道" with base url "https://api.test/v1", api key "sk-secret1234", and model "gpt-4o-mini"
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
    When I add an OpenAI-compatible provider named "我的智谱" with base url "https://api.test/v1", api key "sk-secret1234", and model "glm-4.7-flash"
    Then I should see a provider config item named "我的智谱"
    And the provider config "我的智谱" should show a masked key
    When I delete the provider config "我的智谱"
    Then I should not see the provider config "我的智谱"

  # ---- AI-714: 模型必填 + 能力多选 + 按模型真验证（保存前硬校验） ----

  Scenario: Parent cannot save a provider without specifying a model (AI-714)
    Given I am logged in as a new parent
    When I open the parent panel
    Then I should see the AI provider config section
    When I open the add provider form
    And I fill the provider form name "无模型通道" base url "https://api.test/v1" api key "sk-secret1234" without a model
    And I click save on the provider form
    Then the provider config form should still be open
    And I should not see the provider config "无模型通道"

  Scenario: Parent adds a provider with a model and no capabilities, and it is saved (AI-714)
    Given I am logged in as a new parent
    When I open the parent panel
    Then I should see the AI provider config section
    When I add an OpenAI-compatible provider named "纯对话通道" with base url "https://api.test/v1", api key "sk-secret1234", and model "gpt-4o-mini"
    Then I should see a provider config item named "纯对话通道"
    When I delete the provider config "纯对话通道"
    Then I should not see the provider config "纯对话通道"

  Scenario: Parent selects capabilities, sees per-capability validation, and an unsupported model blocks save (AI-714)
    Given I am logged in as a new parent
    When I open the parent panel
    Then I should see the AI provider config section
    When I open the add provider form
    And I fill the provider form name "缺陷模型通道" base url "http://127.0.0.1:9" api key "sk-secret1234" and model "tts-1"
    And I select provider capabilities "chat,tts"
    And I click save on the provider form
    Then I should see the capability validation result
    And the capability "chat" should be marked not ok
    And I should not see the provider config "缺陷模型通道"
