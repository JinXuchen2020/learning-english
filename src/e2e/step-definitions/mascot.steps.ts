// AI mascot growth story steps (AI-603).
import { Then, When } from "@cucumber/cucumber";
import MascotPage from "../support/pages/mascot";
import type E2EWorld from "../support/world";

Then("I should see the mascot growth card", async function (this: E2EWorld) {
  const mascot = new MascotPage(this.page, this.baseUrl);
  await mascot.waitForGrowthCard();
});

Then(
  "the mascot in the growth card should show level {int}",
  async function (this: E2EWorld, expected: number) {
    const mascot = new MascotPage(this.page, this.baseUrl);
    const level = await mascot.growthCardLevel();
    if (level === null) {
      throw new Error("Mascot in growth card has no data-level attribute");
    }
    if (Number(level) !== expected) {
      throw new Error(`Expected mascot level ${expected} but got ${level}`);
    }
  },
);

When("I click the view growth story button", async function (this: E2EWorld) {
  const mascot = new MascotPage(this.page, this.baseUrl);
  await mascot.clickViewStory();
});

Then(
  "I should see the mascot story modal with a title and text",
  async function (this: E2EWorld) {
    const mascot = new MascotPage(this.page, this.baseUrl);
    await mascot.waitForStoryModal();
    const title = await mascot.storyTitle();
    const text = await mascot.storyText();
    if (!title || title.length === 0) {
      throw new Error("Expected mascot story modal to have a non-empty title");
    }
    if (!text || text.length === 0) {
      throw new Error("Expected mascot story modal to have non-empty story text");
    }
  },
);
