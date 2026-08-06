Feature: Speech practice
  As a signed-in child
  I want to practice speaking words with Foxy
  So that I can improve my pronunciation and earn stars

  Scenario: A signed-in child opens the speech practice page and sees a word card with a listen button
    Given I am logged in as a new user
    When I open the speech practice page
    Then I should see the speech practice heading
    And I should see at least 1 word card
    And I should see a listen button

  Scenario: A child listens, records, submits, and earns a star on a good pronunciation
    Given I am logged in as a new user
    And the speech evaluation will return a passing score
    When I open the speech practice page
    And I click the listen button
    And I record my voice
    And I submit the recording
    Then I should see the speech feedback panel
    And I should see a star earned
    And the star count should be 1

  Scenario: A child gets encouraging feedback on a weak pronunciation
    Given I am logged in as a new user
    And the speech evaluation will return a failing score
    When I open the speech practice page
    And I record my voice
    And I submit the recording
    Then I should see the speech feedback panel
    And I should not see a star earned
