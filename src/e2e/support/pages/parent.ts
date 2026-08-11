// Page object for the parent control panel (src/app/parent/page.tsx, AuthGate wrapped).
//
// Regions & hooks:
//   [data-component="ParentPanel"]        根容器（gate 与 panel 视图共用外层）
//   [data-component="ParentPinGate"]      PIN 门禁（未持家长 token 时显示）
//     [data-component="PinInput"]         4 位 PIN 输入
//     [data-component="PinSubmit"]        提交（设置 / 进入）
//     [data-component="PinError"]         PIN 错误提示
//   [data-component="ExitParentBtn"]      退出家长模式（仅 panel 视图有 → 用作「已进入面板」判定）
//   [data-component="ParentApprovals"]    审批区（仅 panel 视图）
//     [data-component="ApprovalItem"]     待审批项（data-redemption-id / data-redemption-status）
//       [data-component="ApproveBtn"] / [data-component="RejectBtn"]
//   [data-component="PinManage"] / [data-component="ChangePinBtn"]
//   [data-component="ReportPlaceholder"]  M5 报告预留
//
// 断言全部用 waitForFunction 等异步渲染，禁止 locator.count() 即时计数。
import { Page } from "@playwright/test";

const PARENT_PATH = "/parent";

export default class ParentPage {
  private page: Page;
  private baseUrl: string;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  async open(): Promise<void> {
    // JWT 已镜像到 localStorage，整页 goto 亦保留登录态；优先点 TabNav 链接，
    // 找不到（/parent 不在 TabNav）则走 goto 兜底（middleware 重定向到默认 locale 前缀）。
    const link = this.page.locator(`nav a[href="${PARENT_PATH}"]`);
    if (await link.count()) {
      await link.first().click();
    } else {
      await this.page.goto(`${this.baseUrl}${PARENT_PATH}`);
    }
    await this.page.waitForSelector('[data-component="ParentPanel"]');
  }

  /** 等待 PIN 门禁出现（未持家长 token）。 */
  async waitForGate(timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      () => !!document.querySelector('[data-component="ParentPinGate"]'),
      undefined,
      { timeout },
    );
  }

  /** 等待进入面板（ExitParentBtn 仅 panel 视图渲染，作为「已进入」判定）。 */
  async waitForPanel(timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      () => !!document.querySelector('[data-component="ExitParentBtn"]'),
      undefined,
      { timeout },
    );
  }

  /** 设置 PIN（首次，hasPin=false 时）：填 PIN → 提交 → 等进入面板。 */
  async setPin(pin: string): Promise<void> {
    await this.page
      .locator('[data-component="PinInput"]')
      .fill(pin);
    await this.page.locator('[data-component="PinSubmit"]').click();
    await this.waitForPanel();
  }

  /** 输入 PIN（验证模式）：填 PIN → 提交，不假设成功（调用方自行判定 error/panel）。 */
  async enterPin(pin: string): Promise<void> {
    await this.page
      .locator('[data-component="PinInput"]')
      .fill(pin);
    await this.page.locator('[data-component="PinSubmit"]').click();
  }

  /** 等待 PIN 错误提示出现。 */
  async waitForPinError(timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      () => !!document.querySelector('[data-component="PinError"]'),
      undefined,
      { timeout },
    );
  }

  /** 退出家长模式 → 回到门禁。 */
  async exitParent(): Promise<void> {
    await this.page.locator('[data-component="ExitParentBtn"]').click();
    await this.waitForGate();
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
        `[data-component="ProviderConfigItem"][data-config-name="${CSS.escape(name)}"] [data-component="SetDefaultProviderBtn"]`,
      )
      .click();
  }

  /** 在指定配置项内点击「测试连通」。 */
  async testProvider(name: string): Promise<void> {
    await this.page
      .locator(
        `[data-component="ProviderConfigItem"][data-config-name="${CSS.escape(name)}"] [data-component="TestProviderBtn"]`,
      )
      .click();
  }

  /** 在指定配置项内点击「删除」。 */
  async deleteProvider(name: string): Promise<void> {
    await this.page
      .locator(
        `[data-component="ProviderConfigItem"][data-config-name="${CSS.escape(name)}"] [data-component="DeleteProviderBtn"]`,
      )
      .click();
  }

  /** 等待某配置项出现连通性探测结果（成功或失败均算出现）。 */
  async waitForProviderTestResult(name: string, timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (n: string) =>
        !!document.querySelector(
          `[data-component="ProviderTestResult"][data-config-id]`,
        ) &&
        !!document.querySelector(
          `[data-component="ProviderConfigItem"][data-config-name="${CSS.escape(n)}"] [data-component="ProviderTestResult"]`,
        ),
      name,
      { timeout },
    );
  }
}
