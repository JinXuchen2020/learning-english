Feature: Shared Dialog primitive accessibility (AI-805)
  As a keyboard and screen-reader user
  I want every overlay (bottom drawer and centered modal) to behave like an
  accessible dialog
  So that I can close it with Escape, never lose focus to the page behind, and
  always land back on the control that opened it

  # MoreDrawer uses the bottom-drawer variant; the mascot story modal uses the
  # center variant. Together they exercise both Dialog paths.

  Background:
    Given I am logged in as a new user

  Scenario: More drawer closes on Escape and returns focus to its trigger (AI-805)
    When I open the more drawer
    Then the dialog "MoreDrawer" should close when I press Escape
    And focus should be restored to the more drawer trigger

  Scenario: More drawer closes when the backdrop is clicked (AI-805)
    When I open the more drawer
    Then the dialog "MoreDrawer" should close when I click the backdrop

  Scenario: More drawer traps Tab focus inside the dialog (AI-805)
    When I open the more drawer
    Then Tab focus should stay inside the dialog "MoreDrawer" after 6 presses

  Scenario: Mascot story modal closes on Escape and returns focus to its trigger (AI-805)
    Given the mascot growth story is stubbed
    When I click the view growth story button
    Then the dialog "MascotStoryModal" should close when I press Escape
    And focus should be restored to the view growth story button

  Scenario: Mascot story modal traps Tab focus inside the dialog (AI-805)
    Given the mascot growth story is stubbed
    When I click the view growth story button
    Then Tab focus should stay inside the dialog "MascotStoryModal" after 6 presses
