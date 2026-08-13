// Page object for the parent control panel (src/app/[locale]/parent/page.tsx,
// AuthGuard wrapped; role==='parent' renders the panel directly — no PIN gate).
//
// Regions & hooks:
//   [data-component="ParentPanel"]        根容器（家长账号直接渲染）
//   [data-component="ParentUnauthorized"] 非家长账号的拒绝视图
//   [data-component="ParentApprovals"]    审批区
//     [data-component="ApprovalItem"]     待审批项（data-redemption-id / data-redemption-status）
//       [data-component="ApproveBtn"] / [data-component="RejectBtn"]
//   [data-component="ProviderConfigSection"]  AI 提供商配置区（AI-705）
//
// 断言全部用 waitForFunction 等异步渲染，禁止 locator.count() 即时计数。
import { Page } from "@playwright/test";

// CSS.escape is a *browser* global. These page-object methods run in the Node
// harness, where `CSS` is undefined — so calling CSS.escape() here throws
// "ReferenceError: CSS is not defined". Polyfill the subset we need so
// attribute selectors with CJK / special characters build safely in both
// contexts (browser waitForFunction still hits the real CSS.escape branch).
function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  // Minimal fallback: escape backslashes and double quotes (the only chars that
  // break a double-quoted CSS attribute selector).
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

const PARENT_PATH = "/parent";

export default class ParentPage {
  private page: Page;
  private baseUrl: string;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  async open(): Promise<void> {
    // JWT 已镜像到 localStorage，整页 goto 亦保留登录态；/parent 不在 TabNav，
    // 走 goto 兜底（middleware 重定向到默认 locale 前缀）。
    await this.page.goto(`${this.baseUrl}${PARENT_PATH}`);
    await this.page.waitForSelector('[data-component="ParentPanel"]');
  }

  /** 等待进入面板（ParentPanel 仅家长账号渲染，作为「已进入」判定）。 */
  async waitForPanel(timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      () => !!document.querySelector('[data-component="ParentPanel"]'),
      undefined,
      { timeout },
    );
  }

  /** 等待至少 min 条待审批项（异步拉取后）。 */
  async waitForPendingApprovals(min: number, timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (m: number) =>
        document.querySelectorAll('[data-component="ApprovalItem"]').length >= m,
      min,
      { timeout },
    );
  }

  /** 批准第一条待审批项，并等待该项从 pending 列表消失（状态翻 approved 后不再出现在 pending 列表）。 */
  async approveFirst(): Promise<void> {
    const btn = this.page.locator('[data-component="ApproveBtn"]').first();
    const id = await btn
      .getAttribute("data-redemption-id")
      .then((v) => v as string);
    await btn.click();
    await this.page.waitForFunction(
      (rid: string) =>
        !document.querySelector(
          `[data-component="ApprovalItem"][data-redemption-id="${rid}"]`,
        ),
      id,
      { timeout: 15000 },
    );
  }

  /* ---------------------- AI Provider Config (AI-705) ---------------------- */

  /** 等待 AI 提供商配置区出现。 */
  async waitForProviderSection(timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      () => !!document.querySelector('[data-component="ProviderConfigSection"]'),
      undefined,
      { timeout },
    );
  }

  /** 打开新增/编辑表单。 */
  async clickAddProvider(): Promise<void> {
    await this.page.locator('[data-component="AddProviderBtn"]').click();
    await this.page.waitForSelector('[data-component="ProviderConfigForm"]');
  }

  /** 填充表单（type 取值 openai-compatible | bigmodel | mock）。 */
  async fillProviderForm(opts: {
    name: string;
    type?: string;
    baseUrl?: string;
    apiKey?: string;
  }): Promise<void> {
    await this.page
      .locator('[data-component="ProviderNameInput"]')
      .fill(opts.name);
    if (opts.type) {
      await this.page
        .locator('[data-component="ProviderTypeSelect"]')
        .selectOption(opts.type);
    }
    if (opts.baseUrl !== undefined) {
      await this.page
        .locator('[data-component="ProviderBaseUrlInput"]')
        .fill(opts.baseUrl);
    }
    if (opts.apiKey !== undefined) {
      await this.page
        .locator('[data-component="ProviderApiKeyInput"]')
        .fill(opts.apiKey);
    }
  }

  /** 保存表单，并等待模态表单关闭（ProviderConfigForm 卸载）。 */
  async saveProvider(): Promise<void> {
    await this.page.locator('[data-component="SaveProviderBtn"]').click();
    await this.page.waitForFunction(
      () => !document.querySelector('[data-component="ProviderConfigForm"]'),
      undefined,
      { timeout: 15000 },
    );
  }

  /** 等待某个命名的配置项出现（异步拉取后）。 */
  async waitForProviderItem(name: string, timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (n: string) =>
        !!document.querySelector(
          `[data-component="ProviderConfigItem"][data-config-name="${CSS.escape(n)}"]`,
        ),
      name,
      { timeout },
    );
  }

  /** 等待某个命名的配置项消失（删除后）。 */
  async waitForProviderItemGone(name: string, timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (n: string) =>
        !document.querySelector(
          `[data-component="ProviderConfigItem"][data-config-name="${CSS.escape(n)}"]`,
        ),
      name,
      { timeout },
    );
  }

  /** 等待某配置项被标记为默认（data-config-default=true）。 */
  async waitForProviderDefault(name: string, timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (n: string) => {
        const el = document.querySelector(
          `[data-component="ProviderConfigItem"][data-config-name="${CSS.escape(n)}"]`,
        );
        return !!el && el.getAttribute("data-config-default") === "true";
      },
      name,
      { timeout },
    );
  }

  /** 等待某配置项展示掩码密钥（文本含 ****，且非「未配置密钥」）。 */
  async waitForProviderMasked(name: string, timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (n: string) => {
        const el = document.querySelector(
          `[data-component="ProviderConfigItem"][data-config-name="${CSS.escape(n)}"]`,
        );
        if (!el) return false;
        const txt = el.textContent || "";
        // 语言无关：密钥已配置时 masked 恒含 "****"（如 "****1234"），未配置走 localized noKey 文案无 "****"。
        return /\*\*\*\*/.test(txt);
      },
      name,
      { timeout },
    );
  }

  /** 在指定配置项内点击「设为默认」。 */
  async setProviderDefault(name: string): Promise<void> {
    await this.page
      .locator(
        `[data-component="ProviderConfigItem"][data-config-name="${cssEscape(name)}"] [data-component="SetDefaultProviderBtn"]`,
      )
      .click();
  }

  /** 在指定配置项内点击「测试连通」。 */
  async testProvider(name: string): Promise<void> {
    await this.page
      .locator(
        `[data-component="ProviderConfigItem"][data-config-name="${cssEscape(name)}"] [data-component="TestProviderBtn"]`,
      )
      .click();
  }

  /** 在指定配置项内点击「删除」。 */
  async deleteProvider(name: string): Promise<void> {
    await this.page
      .locator(
        `[data-component="ProviderConfigItem"][data-config-name="${cssEscape(name)}"] [data-component="DeleteProviderBtn"]`,
      )
      .click();
  }

  /** 等待某配置项出现连通性探测结果（成功或失败均算出现）。 */
  async waitForProviderTestResult(name: string, timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (n: string) =>
        !!document.querySelector(
          `[data-component="ProviderConfigItem"][data-config-name="${CSS.escape(n)}"] [data-component="ProviderTestResult"]`,
        ),
      name,
      { timeout },
    );
  }
}
