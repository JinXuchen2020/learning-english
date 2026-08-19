Feature: Plan streaming generation (AI-804)
  As a signed-in child
  I want the plan generation to stream over a Server-Sent-Events endpoint
  So that the frontend is driven by the stream's done/error events (no blank screen)

  Scenario: A signed-in child generates a plan through the streaming endpoint and sees the structured preview
    Given I am logged in as a new user
    And the plan generate stream will return a valid plan
    When I open the plan wizard
    And I select age range "6-8"
    And I select level "a1"
    And I select daily minutes "20"
    And I toggle interest "动物"
    And I select weeks "2"
    And I submit the plan generation
    Then I should see the plan preview with at least 1 week
    And I should see at least 1 plan day card

  Scenario: A signed-in child sees an error and a retry button, and retry re-runs the stream to success
    Given I am logged in as a new user
    And the plan generate stream will fail once then succeed
    When I open the plan wizard
    And I select age range "6-8"
    And I select level "a1"
    And I select daily minutes "20"
    And I toggle interest "动物"
    And I select weeks "2"
    And I submit the plan generation
    Then I should see the plan stream error
    And I should see a retry button
    When I click the retry button
    Then I should see the plan preview with at least 1 week
