Feature: Chat with Foxy
  As a signed-in child
  I want to talk with the fox mascot in themed scenes
  So that I can practice English conversation with voice and read-along

  Scenario: A signed-in child opens the chat page and sees scene cards and an input
    Given I am logged in as a new user
    And the chat scenes are stubbed with 2 scenes
    When I open the chat page
    Then I should see the chat heading
    And I should see at least 1 scene card
    And I should see a chat input

  Scenario: A child picks a scene and sees the fox opening line and goal words
    Given I am logged in as a new user
    And the chat scenes are stubbed with 2 scenes
    When I open the chat page
    And I select the scene "打招呼"
    Then I should see a fox opening bubble
    And I should see the goal words

  Scenario: A child sends a message and hears the fox reply with auto-playing voice
    Given I am logged in as a new user
    And the chat scenes are stubbed with 2 scenes
    And the chat reply will be "Hello! I am Foxy. How are you?" with a fox voice
    When I open the chat page
    And I type "hi foxy" into the chat input
    And I send the chat message
    Then I should see 1 user bubble
    And I should see 1 fox reply bubble
    And I should see a TTS audio bar
    And the fox voice should auto-play

  Scenario: A child continues the conversation across multiple turns
    Given I am logged in as a new user
    And the chat scenes are stubbed with 2 scenes
    And the chat reply will be "Nice to meet you!" with a fox voice
    When I open the chat page
    And I type "hello" into the chat input
    And I send the chat message
    And I type "what is your name" into the chat input
    And I send the chat message
    Then I should see 2 user bubbles
    And I should see 2 fox reply bubbles

  Scenario: A child reads along after the fox and earns a star on a good pronunciation
    Given I am logged in as a new user
    And the chat scenes are stubbed with 2 scenes
    And the chat reply will be "Hello! Say it with me." with a fox voice
    And the read-along evaluation will return a passing score
    When I open the chat page
    And I type "hi" into the chat input
    And I send the chat message
    And I click read-along on the first fox reply
    And I record my read-along voice
    And I submit the read-along
    Then I should see the read-along feedback
    And I should see a read-along star earned

  Scenario: When a message is unsafe the child gets a gentle fox reply
    Given I am logged in as a new user
    And the chat scenes are stubbed with 2 scenes
    And the chat reply is the safety fallback "Let's talk about something friendly instead!"
    When I open the chat page
    And I type "something not nice" into the chat input
    And I send the chat message
    Then I should see 1 fox reply bubble
    And the fox reply should say "Let's talk about something friendly instead!"
