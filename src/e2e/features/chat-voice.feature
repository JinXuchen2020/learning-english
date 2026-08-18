Feature: Chat voice input (AI-802)
  As a signed-in child
  I want to speak to Foxy instead of typing
  So that I can practice English conversation hands-free

  Scenario: A child uses the mic to dictate English into the chat input
    Given I am logged in as a new user
    And the chat scenes are stubbed with 2 scenes
    And the chat reply will be "Nice to meet you!" with a fox voice
    And the speech recognition will return "Hello Foxy"
    When I open the chat page
    Then I should see the voice input button
    When I click the voice input button
    Then the voice input should be listening
    And the chat input should contain "Hello Foxy"
    When I send the chat message
    Then I should see 1 user bubble

  Scenario: The voice input button is disabled when speech recognition is unsupported
    Given I am logged in as a new user
    And the chat scenes are stubbed with 2 scenes
    And speech recognition is unsupported
    When I open the chat page without speech recognition
    Then I should see the voice input button
    And the voice input button should be disabled
