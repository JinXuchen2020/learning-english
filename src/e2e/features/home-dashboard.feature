Feature: Home dashboard
  As a signed-in child
  I want to see my courses and daily tasks on the home page
  So that I know what to learn today

  Scenario: A signed-in child sees courses and daily tasks
    Given I am logged in as a new user
    Then I should see the greeting containing "Foxy"
    And I should see 3 course cards
    And I should see 3 daily tasks

  Scenario: A child sees their earned chat stars on the home dashboard (AI-408)
    Given the chat stars endpoint returns 3 stars
    And I am logged in as a new user
    Then I should see the chat stars card with 3

  Scenario: A child sees their daily AI report card on the home dashboard (AI-504)
    Given the daily report endpoint returns a report with summary "今天你超棒！" and weak words "apple,banana"
    And I am logged in as a new user
    Then I should see the AI report card
    And the AI report summary should contain "今天你超棒！"
    And the AI report weak words should contain "apple" and "banana"

  Scenario: A child can expand the AI report details (AI-504)
    Given the daily report endpoint returns a report with summary "Keep going!" and weak words ""
    And I am logged in as a new user
    Then I should see the AI report card
    When I expand the AI report details
    Then I should see the AI report details containing the report date

  Scenario: A child sees a generate button when the AI report fails, then it loads on retry (AI-504)
    Given the daily report endpoint fails first then succeeds with summary "Retried ok!"
    And I am logged in as a new user
    Then I should see the AI report generate button
    When I click the AI report generate button
    Then I should see the AI report summary containing "Retried ok!"
