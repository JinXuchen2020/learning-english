// Shared accessibility assertions for the AI-805 Dialog primitive.
//
// The Dialog primitive (src/components/ui/dialog.tsx) guarantees the same
// overlay semantics for every consumer (MoreDrawer, Mascot story modal,
// picture-book reader modal):
//   - Escape closes the dialog
//   - clicking the backdrop (overlay, outside the panel) closes it
//   - Tab is trapped inside the dialog (focus never escapes to the page behind)
//   - on close, focus is restored to the element that opened it
//
// These helpers are language-independent: they locate the overlay by its
// data-component name and assert DOM / focus behaviour directly, so the same
// steps work against the zh CI locale and any future locale.
import { Page } from "@playwright/test";

export default class DialogAssert {
  private page: Page;
  private overlayComponent: string;

  constructor(page: Page, overlayComponent: string) {
    this.page = page;
    this.overlayComponent = overlayComponent;
  }

  private overlay() {
    return this.page.locator(`[data-component="${this.overlayComponent}"]`).first();
  }

  private isInsideOverlay(): Promise<boolean> {
    return this.page.evaluate((comp) => {
      const overlay = document.querySelector(`[data-component="${comp}"]`);
      return !!overlay && overlay.contains(document.activeElement);
    }, this.overlayComponent);
  }

  /** Press Escape and assert the overlay is removed from the DOM. */
  async pressEscapeAndExpectClosed(): Promise<void> {
    await this.page.keyboard.press("Escape");
    await this.overlay().waitFor({ state: "detached", timeout: 5000 });
  }

  /** Click the backdrop (an empty corner of the overlay, outside the panel). */
  async clickBackdropAndExpectClosed(): Promise<void> {
    await this.overlay().click({ position: { x: 4, y: 4 } });
    await this.overlay().waitFor({ state: "detached", timeout: 5000 });
  }

  /**
   * Press Tab `presses` times and assert focus never leaves the overlay.
   * This is the core "focus trap" check — a keyboard user must not be able to
   * tab behind the modal onto the page content.
   */
  async assertTabTrapped(presses: number): Promise<void> {
    for (let i = 0; i < presses; i += 1) {
      await this.page.keyboard.press("Tab");
      if (!(await this.isInsideOverlay())) {
        throw new Error(
          `Focus escaped the dialog "${this.overlayComponent}" after ${i + 1} Tab press(es)`,
        );
      }
    }
  }

  /**
   * Assert that focus was returned to the trigger element after the dialog
   * closed (so keyboard / screen-reader users keep their place).
   * `triggerSelector` is a full CSS selector for the element that opened the
   * dialog (e.g. the "更多" tab button or the "看成长故事" button).
   */
  async assertFocusRestoredTo(triggerSelector: string): Promise<void> {
    await this.page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return !!el && document.activeElement === el;
      },
      triggerSelector,
      { timeout: 5000 },
    );
  }
}
