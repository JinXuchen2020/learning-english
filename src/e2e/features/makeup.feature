Feature: AI-704 Makeup Queue
  昨日未掌握/未完成任务进入「补学队列」并可补学拿分；与 AI-605 到期复习去重，不重复计分。

  Background:
    Given I am logged in as a new user

  Scenario: Makeup weak word deep-links to practice (昨日弱词可补学)
    When I seed a makeup queue for yesterday
    Then I should see the makeup card with at least 1 makeup word and 1 missed task
    When I click the first makeup word link
    Then I should be on the practice page for the makeup word "Cat"

  Scenario: Mark a missed plan day as done (补学未完成计划日回写完成态)
    When I seed a makeup queue for yesterday
    Then I should see the makeup card with at least 1 makeup word and 1 missed task
    When I click the first makeup complete button
    Then the missed task should be removed from the makeup card
