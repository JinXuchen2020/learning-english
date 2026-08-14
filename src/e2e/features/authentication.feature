Feature: Authentication
  As a child learner
  I want to sign up and sign in
  So that Foxy can remember my progress

  # AI-710: 公开注册仅家长可走；孩子由家长创建。这里用已建立的
  # "I am logged in as a new user" helper（注册家长→API 建孩子→以孩子登录），
  # 直接落到孩子首页 Home。

  Scenario: A new child account lands on the home page
    Given I am logged in as a new user
    Then I should be redirected to the home page
    And I should see the greeting "Foxy"

  Scenario: A child can sign in again
    Given I am logged in as a new user
    Then I should be redirected to the home page
    When I go to the login page
    And I log in with the registered user
    Then I should be redirected to the home page
    And I should see the greeting "Foxy"

  Scenario: Wrong password shows a friendly error
    Given I am on the login page
    When I log in with username "nobody_known" and password "wrongpass"
    Then I should see an error message "Oops! Wrong username or password."
