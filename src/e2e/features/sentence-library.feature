Feature: Sentence library practice
  As a signed-in child
  I want to practice speaking sentences from the library
  So that I can improve my fluency with longer phrases

  Scenario: A signed-in child switches to sentences mode and sees a sentence card
    Given I am logged in as a new user
    When I open the speech practice page
    And I switch to sentences mode
    Then I should see at least 1 sentence card
    And I should see a listen button

  Scenario: A child practices a sentence and earns a star on a good pronunciation
    Given I am logged in as a new user
    And the speech evaluation will return a passing score
    When I open the speech practice page
    And I switch to sentences mode
    And I record my voice
    And I submit the recording
    Then I should see the speech feedback panel
    And I should see a star earned
    And the star count should be 1
