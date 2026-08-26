// AI-805: accessibility behaviour of the shared Dialog primitive.
//
// The "open" steps (I open the more drawer / I click the view growth story
// button / the mascot growth story is stubbed) are defined once in
// more-drawer.steps.ts and mascot.steps.ts and reused here unmodified.
// This file only adds the dialog-level assertions that apply to every
// consumer of the Dialog primitive.
import { Then } from "@cucumber/cucumber";
import DialogAssert from "../support/pages/dialog";
import type E2EWorld from "../support/world";

// --- Generic, data-component-keyed dialog assertions -------------------------

Then(
  "the dialog {string} should close when I press Escape",
  async function (this: E2EWorld, overlayComponent: string) {
    const dialog = new DialogAssert(this.page, overlayComponent);
    await dialog.pressEscapeAndExpectClosed();
  },
);

Then(
  "the dialog {string} should close when I click the backdrop",
  async function (this: E2EWorld, overlayComponent: string) {
    const dialog = new DialogAssert(this.page, overlayComponent);
    await dialog.clickBackdropAndExpectClosed();
  },
);

Then(
  "Tab focus should stay inside the dialog {string} after {int} presses",
  async function (this: E2EWorld, overlayComponent: string, presses: number) {
    const dialog = new DialogAssert(this.page, overlayComponent);
    await dialog.assertTabTrapped(presses);
  },
);

// --- Focus-restore assertions (trigger-specific selectors) -------------------

// The "更多" tab button that opens the bottom drawer carries
// aria-haspopup="dialog" and is the element focus must return to.
Then(
  "focus should be restored to the more drawer trigger",
  async function (this: E2EWorld) {
    const dialog = new DialogAssert(this.page, "MoreDrawer");
    await dialog.assertFocusRestoredTo(
      '[data-component="TabNav"] button[aria-haspopup="dialog"]',
    );
  },
);

// The "看成长故事" button that opens the mascot story modal.
Then(
  "focus should be restored to the view growth story button",
  async function (this: E2EWorld) {
    const dialog = new DialogAssert(this.page, "MascotStoryModal");
    await dialog.assertFocusRestoredTo('[data-component="ViewGrowthStoryBtn"]');
  },
);
