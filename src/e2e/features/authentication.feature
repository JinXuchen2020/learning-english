Feature: Authentication
  As a child learner
  I want to sign up and sign in
  So that Foxy can remember my progress

  Scenario: A new child registers and lands on the home page
    Given I am on the login page
    When I switch to "Sign Up" mode
    And I register with a unique username and password "Passw0rd!23"
    Then I should be redirected to the home page
    And I should see the greeting "I'm Foxy!"

  Scenario: A registered child can sign in again
    Given I am on the login page
    When I register with a unique username and password "Passw0rd!23"
    Then I should be redirected to the home page
    When I go to the login page
    And I log in with the registered user
    Then I should be redirected to the home page
    And I should see the greeting "I'm Foxy!"

  Scenario: Wrong password shows a friendly error
    Given I am on the login page
    When I log in with username "nobody_known" and password "wrongpass"
    Then I should see an error message "Oops! Wrong username or password."
