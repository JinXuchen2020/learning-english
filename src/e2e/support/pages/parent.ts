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

  /** 填充表单（type 取值 openai-compatible | bigmodel；AI-713 起已无 mock 类型）。 */
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
      // 自定义 Select 原语：trigger 是 <button>，选项为 [data-component="SelectOption"][data-value=...]。
      // 原生 selectOption() 不可用，改为「点开 → 点选项」。
      const trigger = this.page.locator('[data-component="ProviderTypeSelect"]');
      await trigger.click();
      const option = this.page.locator(
        `[data-component="SelectOption"][data-value="${opts.type}"]`,
      );
      await option.waitFor({ state: "visible", timeout: 5000 });
      await option.click();
      // 选项点击后下拉应关闭；等待 trigger 不再 aria-expanded，确保选择已落定。
      await this.page.waitForFunction(
        () => {
          const t = document.querySelector('[data-component="ProviderTypeSelect"]');
          return t && t.getAttribute("aria-expanded") === "false";
        },
        undefined,
        { timeout: 5000 },
      );
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

  /* ---------------------- Children Management (AI-710) ---------------------- */

  /** 等待「我的孩子」区块出现。 */
  async waitForChildrenSection(timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      () => !!document.querySelector('[data-component="ChildrenSection"]'),
      undefined,
      { timeout },
    );
  }

  /** 点击「添加孩子」按钮，等待表单出现。 */
  async clickAddChild(): Promise<void> {
    await this.page.locator('[data-component="AddChildBtn"]').click();
    await this.page.waitForSelector('[data-component="AddChildForm"]');
  }

  /** 切换到「新建账号」Tab。 */
  async clickCreateTab(): Promise<void> {
    await this.page.locator('[data-testid="add-child-tab-create"]').click();
  }

  /** 切换到「认领已有」Tab。 */
  async clickClaimTab(): Promise<void> {
    await this.page.locator('[data-testid="add-child-tab-claim"]').click();
  }

  /** 填充创建孩子表单（昵称/用户名/密码）。 */
  async fillCreateChildForm(
    nickname: string,
    username: string,
    password: string,
  ): Promise<void> {
    await this.page.locator('[data-component="ChildNicknameInput"]').fill(nickname);
    await this.page.locator('[data-component="ChildUsernameInput"]').fill(username);
    await this.page.locator('[data-component="ChildPasswordInput"]').fill(password);
  }

  /** 填充认领孩子表单（用户名/密码，无昵称字段）。 */
  async fillClaimChildForm(username: string, password: string): Promise<void> {
    await this.page.locator('[data-component="ChildUsernameInput"]').fill(username);
    await this.page.locator('[data-component="ChildPasswordInput"]').fill(password);
  }

  /** 点击提交按钮并等待表单关闭（成功后表单卸载）。 */
  async submitChildForm(): Promise<void> {
    await this.page.locator('[data-component="SubmitChildBtn"]').click();
    await this.page.waitForFunction(
      () => !document.querySelector('[data-component="AddChildForm"]'),
      undefined,
      { timeout: 15000 },
    );
  }

  /**
   * 等待指定昵称的孩子项出现。ChildItem 的昵称是文本内容（非 data 属性），
   * 所以用 evaluate 在所有 ChildItem 中按文本匹配。
   */
  async waitForChildItem(nickname: string, timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (nick: string) => {
        const items = document.querySelectorAll('[data-component="ChildItem"]');
        return Array.from(items).some(
          (el) => (el.textContent || "").includes(nick),
        );
      },
      nickname,
      { timeout },
    );
  }

  /** 等待指定昵称的孩子项消失（解除绑定后）。 */
  async waitForChildItemGone(nickname: string, timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (nick: string) => {
        const items = document.querySelectorAll('[data-component="ChildItem"]');
        return !Array.from(items).some(
          (el) => (el.textContent || "").includes(nick),
        );
      },
      nickname,
      { timeout },
    );
  }

  /**
   * 解除指定昵称孩子的绑定。先找到匹配的 ChildItem，点击 UnlinkChildBtn 打开
   * 内联二次确认，再点击 UnlinkConfirmYesBtn 真正解绑。
   * （不再使用 window.confirm —— Playwright 默认自动 dismiss 会导致解绑无效。）
   */
  async unlinkChild(nickname: string): Promise<void> {
    // 找到匹配昵称的 ChildItem 的 data-child-id
    const childId = await this.page.evaluate((nick: string) => {
      const items = document.querySelectorAll('[data-component="ChildItem"]');
      const found = Array.from(items).find(
        (el) => (el.textContent || "").includes(nick),
      );
      return found ? found.getAttribute("data-child-id") : null;
    }, nickname);
    if (!childId) {
      throw new Error(`Child item with nickname "${nickname}" not found`);
    }
    // 1) 打开内联确认
    await this.page
      .locator(`[data-component="UnlinkChildBtn"][data-child-id="${childId}"]`)
      .click();
    // 2) 等待确认区出现并点击「确认解绑」
    const yesBtn = this.page.locator(
      `[data-component="UnlinkConfirmYesBtn"][data-child-id="${childId}"]`,
    );
    await yesBtn.waitFor({ state: "visible", timeout: 5000 });
    await yesBtn.click();
  }

  /* ---------------------- Per-child provider (AI-711) ---------------------- */

  /** 等待指定昵称孩子项内出现 provider 下拉区。 */
  async waitForChildProviderSelect(
    nickname: string,
    timeout = 15000,
  ): Promise<void> {
    await this.page.waitForFunction(
      (nick: string) => {
        const items = document.querySelectorAll('[data-component="ChildItem"]');
        const found = Array.from(items).find(
          (el) => (el.textContent || "").includes(nick),
        );
        return !!found && !!found.querySelector('[data-component="ChildProviderSelectWrap"]');
      },
      nickname,
      { timeout },
    );
  }

  /**
   * 在指定昵称孩子项的下拉中选择某个 provider（按 value=configId；"" 表示沿用家长默认）。
   * 点击自定义 Select 的 trigger → 点对应 data-value 的 SelectOption →
   * 等待 ChildItem 的 data-child-override 同步为该 value。
   */
  async selectChildProviderByValue(
    nickname: string,
    value: string,
  ): Promise<void> {
    const childId = await this.page.evaluate((nick: string) => {
      const items = document.querySelectorAll('[data-component="ChildItem"]');
      const found = Array.from(items).find(
        (el) => (el.textContent || "").includes(nick),
      );
      return found ? found.getAttribute("data-child-id") : null;
    }, nickname);
    if (!childId) {
      throw new Error(`Child item with nickname "${nickname}" not found`);
    }
    const trigger = this.page.locator(
      `[data-component="ChildItem"][data-child-id="${childId}"] [data-component="ChildProviderSelect"]`,
    );
    await trigger.click();
    const option = this.page.locator(
      `[data-component="ChildItem"][data-child-id="${childId}"] [data-component="SelectOption"][data-value="${value}"]`,
    );
    await option.waitFor({ state: "visible", timeout: 5000 });
    await option.click();
    // 等待 data-child-override 同步为新值（"" = 沿用默认）
    await this.page.waitForFunction(
      (args: { id: string; val: string }) => {
        const el = document.querySelector(
          `[data-component="ChildItem"][data-child-id="${args.id}"]`,
        );
        return !!el && (el.getAttribute("data-child-override") || "") === args.val;
      },
      { id: childId, val: value },
      { timeout: 15000 },
    );
  }

  /**
   * 断言指定昵称孩子项的 data-child-override 等于期望 value（"" = 沿用家长默认）。
   * 语言无关：直接比对 child provider config id 属性。
   */
  async expectChildOverride(
    nickname: string,
    value: string,
    timeout = 15000,
  ): Promise<void> {
    await this.page.waitForFunction(
      (args: { nick: string; val: string }) => {
        const items = document.querySelectorAll('[data-component="ChildItem"]');
        const found = Array.from(items).find(
          (el) => (el.textContent || "").includes(args.nick),
        );
        if (!found) return false;
        const override = found.getAttribute("data-child-override") || "";
        if (args.val === "") {
          return override === "";
        }
        return override === args.val;
      },
      { nick: nickname, val: value },
      { timeout },
    );
  }
}
