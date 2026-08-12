// Page object for the rewards store (src/app/rewards/page.tsx, wrapped by AuthGate).
//
// Regions & hooks:
//   [data-component="RewardsStore"]             根容器
//   [data-component="RewardCard"]              奖励卡（data-reward-id / data-reward-cost）
//     [data-component="RedeemBtn"]             兑换按钮（data-reward-id）
//   [data-component="BalanceValue"]            余额数字
//   [data-component="LevelRing"]               等级环（SVG）
//   [data-component="MyRedemption"]            我的兑换（data-redemption-id / data-redemption-status）
//   [data-component="ApprovalItem"]            家长待审批项（data-redemption-id / data-redemption-status）
//     [data-component="ApproveBtn"] / [data-component="RejectBtn"]
//
// 奖励/兑换数据由 useEffect 异步拉取，所有断言均用 waitForFunction 等元素就绪，
// 禁止 locator.count() 即时计数（与 parent-report 同口径，规避冷 CI 竞态）。
import { Page } from "@playwright/test";

const REWARDS_PATH = "/rewards";

export default class RewardsPage {
  private page: Page;
  private baseUrl: string;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  async open(): Promise<void> {
    // JWT 已镜像到 localStorage，整页 goto 亦保留登录态；优先点 TabNav 链接，
    // 找不到（i18n 下 href 带 locale 前缀）则走 goto 兜底。
    const link = this.page.locator(`nav a[href="${REWARDS_PATH}"]`);
    if (await link.count()) {
      await link.first().click();
    } else {
      await this.page.goto(`${this.baseUrl}${REWARDS_PATH}`);
    }
    await this.page.waitForSelector('[data-component="RewardsStore"]');
  }

  /** 等待至少 min 个奖励卡渲染（异步拉取后）。 */
  async waitForRewards(min: number, timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (m: number) => document.querySelectorAll('[data-component="RewardCard"]').length >= m,
      min,
      { timeout },
    );
  }

  /** 等待余额文本 >= min（异步拉取后）。 */
  async waitForBalanceAtLeast(min: number, timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (m: number) => {
        const el = document.querySelector('[data-component="BalanceValue"]');
        if (!el) return false;
        const n = Number((el.textContent || "").trim());
        return Number.isFinite(n) && n >= m;
      },
      min,
      { timeout },
    );
  }

  async levelRingVisible(): Promise<boolean> {
    return (await this.page.locator('[data-component="LevelRing"]').count()) > 0;
  }

  /** 兑换指定标题的奖励，并等待「我的兑换」出现 pending 单（异步重拉）。 */
  async redeem(rewardTitle: string): Promise<void> {
    const card = this.page
      .locator('[data-component="RewardCard"]', { hasText: rewardTitle })
      .first();
    await card.locator('[data-component="RedeemBtn"]').click();
    await this.waitForMyRedemptionStatus("pending");
  }

  /** 等待至少一条 MyRedemption 处于给定状态（异步 UI 竞态防护）。 */
  async waitForMyRedemptionStatus(status: string, timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (s: string) =>
        Array.from(document.querySelectorAll('[data-component="MyRedemption"]')).some(
          (el) => el.getAttribute("data-redemption-status") === s,
        ),
      status,
      { timeout },
    );
  }

  /** 读取处于给定状态的第一个 MyRedemption 的 id（供审批跨 step 关联）。 */
  async getRedemptionIdByStatus(status: string): Promise<string> {
    await this.waitForMyRedemptionStatus(status);
    const id = await this.page
      .locator(`[data-component="MyRedemption"][data-redemption-status="${status}"]`)
      .first()
      .getAttribute("data-redemption-id");
    if (!id) throw new Error(`No MyRedemption with status "${status}" found`);
    return id;
  }

  /** 家长批准指定兑换单，并等待其状态翻为 approved（异步重拉）。 */
  async approveRedemption(redemptionId: string): Promise<void> {
    const btn = this.page.locator(
      `[data-component="ApproveBtn"][data-redemption-id="${redemptionId}"]`,
    );
    await btn.click();
    await this.page.waitForFunction(
      (id: string) => {
        const el = document.querySelector(
          `[data-component="MyRedemption"][data-redemption-id="${id}"]`,
        );
        return el && el.getAttribute("data-redemption-status") === "approved";
      },
      redemptionId,
      { timeout: 15000 },
    );
  }
}
