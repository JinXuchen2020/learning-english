// Parent AI provider configuration steps (AI-705).
// 约定：所有断言通过 waitForFunction 等异步渲染完成，不在 step 内用 locator.count() 即时计数。
import { When, Then } from "@cucumber/cucumber";
import ParentPage from "../support/pages/parent";
import type E2EWorld from "../support/world";

function parent(world: E2EWorld): ParentPage {
  return new ParentPage(world.page, world.baseUrl);
}

Then("I should see the AI provider config section", async function (this: E2EWorld) {
  await parent(this).waitForProviderSection();
});

When(
  "I add an OpenAI-compatible provider named {string} with base url {string}, api key {string}, and model {string}",
  async function (this: E2EWorld, name: string, baseUrl: string, apiKey: string, model: string) {
    const p = parent(this);
    await p.clickAddProvider();
    await p.fillProviderForm({ name, type: "openai-compatible", baseUrl, apiKey, model });
    await p.saveProvider();
  }
);

When("I open the add provider form", async function (this: E2EWorld) {
  await parent(this).clickAddProvider();
});

When(
  "I fill the provider form name {string} base url {string} api key {string} without a model",
  async function (this: E2EWorld, name: string, baseUrl: string, apiKey: string) {
    await parent(this).fillProviderForm({ name, baseUrl, apiKey });
  }
);

When(
  "I fill the provider form name {string} base url {string} api key {string} and model {string}",
  async function (this: E2EWorld, name: string, baseUrl: string, apiKey: string, model: string) {
    await parent(this).fillProviderForm({ name, baseUrl, apiKey, model });
  }
);

When(
  "I select provider capabilities {string}",
  async function (this: E2EWorld, capsCsv: string) {
    const caps = capsCsv.split(",").map((c) => c.trim()).filter(Boolean);
    await parent(this).selectProviderCapabilities(caps);
  }
);

When("I click save on the provider form", async function (this: E2EWorld) {
  await parent(this).clickSaveProvider();
});

Then("the provider config form should still be open", async function (this: E2EWorld) {
  await parent(this).waitForProviderForm();
});

Then("I should see the capability validation result", async function (this: E2EWorld) {
  await parent(this).waitForValidationResult();
});

Then(
  "the capability {string} should be marked not ok",
  async function (this: E2EWorld, cap: string) {
    await parent(this).waitForCapabilityNotOk(cap);
  }
);

Then(
  "I should see a provider config item named {string}",
  async function (this: E2EWorld, name: string) {
    await parent(this).waitForProviderItem(name);
  }
);

Then(
  "the provider config {string} should be marked default",
  async function (this: E2EWorld, name: string) {
    await parent(this).waitForProviderDefault(name);
  }
);

Then(
  "the provider config {string} should show a masked key",
  async function (this: E2EWorld, name: string) {
    await parent(this).waitForProviderMasked(name);
  }
);

When(
  "I set the provider config {string} as default",
  async function (this: E2EWorld, name: string) {
    await parent(this).setProviderDefault(name);
    await parent(this).waitForProviderDefault(name);
  }
);

When(
  "I test the provider config {string} connection",
  async function (this: E2EWorld, name: string) {
    await parent(this).testProvider(name);
    await parent(this).waitForProviderTestResult(name);
  }
);

Then(
  "I should see a connection test success for {string}",
  async function (this: E2EWorld, name: string) {
    const el = this.page.locator(
      `[data-component="ProviderConfigItem"][data-config-name="${name}"] [data-component="ProviderTestResult"]`,
    );
    await el.waitFor({ state: "visible", timeout: 15000 });
    const txt = (await el.textContent()) || "";
    // 成功结果以 "✓" 前缀标记（与语言无关；失败为 "✗"），不依赖本地化文案。
    if (!txt.includes("✓")) {
      throw new Error(`Expected connection test success (✓) but got: ${txt}`);
    }
  }
);

When(
  "I delete the provider config {string}",
  async function (this: E2EWorld, name: string) {
    await parent(this).deleteProvider(name);
    await parent(this).waitForProviderItemGone(name);
  }
);

Then(
  "I should not see the provider config {string}",
  async function (this: E2EWorld, name: string) {
    await parent(this).waitForProviderItemGone(name);
  }
);
