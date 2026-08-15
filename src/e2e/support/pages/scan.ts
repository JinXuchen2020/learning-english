// Page object for the AI-606 photo-word (OCR) surface.
// Key hooks (data-component):
//   ScanPage            — 页根
//   TabNav a[href="/scan"] — 底部导航「拍照」入口（客户端导航，force 跳过卸载竞态）
//   ImageUploadInput   — <input type="file"> 上传控件
//   ScanButton         — 「开始识别」按钮
//   ScanCardList / ScanCardItem — 识别出的卡片列表/项
//   ScanAddAllBtn      — 「全部加入生词本」按钮
//   VocabBookList / VocabWordItem (data-word-text) — 生词本列表/项
import { Page } from "@playwright/test";

export default class ScanPage {
  private page: Page;
  private baseUrl: string;
  /** 最近一次识别出的单词（用于加入生词本后的交叉断言）。 */
  lastWords: string[] = [];

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  /** /scan 是无导航入口的孤儿页，无法经 TabNav 客户端导航；直接整页 goto。
   *  JWT 已镜像到 localStorage，整页导航保留登录态；middleware 把裸 /scan
   *  重定向到默认 locale 前缀（如 /zh/scan）。 */
  async navigate(): Promise<void> {
    await this.page.goto(`${this.baseUrl}/scan`);
    await this.page.waitForSelector('[data-component="ScanPage"]', {
      timeout: 15000,
    });
  }

  /** 上传测试图片（fixture 绝对路径）。 */
  async uploadTestImage(fixturePath: string): Promise<void> {
    await this.page
      .locator('[data-component="ImageUploadInput"]')
      .setInputFiles(fixturePath);
  }

  /** 点击「开始识别」。 */
  async clickScan(): Promise<void> {
    await this.page.locator('[data-component="ScanButton"]').click();
  }

  /**
   * Mock 拍照识词链路，使 photo-word 流程在 e2e 中封闭（不依赖外部视觉 AI）：
   *  - POST /api/scan/recognize → 返回确定性待确认卡片（pending）
   *  - POST /api/scan/confirm   → 记录已确认 id（模拟真实落库），回显 saved 卡片
   *  - GET  /api/scan           → 仅返回已确认(saved)卡片，驱动生词本渲染
   * 前端加词走 `loadVocab()` 拉取 GET /api/scan，故必须同时 mock 该端点，
   * 否则 confirm 的假 id 在真实后端找不到 → 生词本为空 → VocabWordItem 出不来。
   */
  async mockRecognize(): Promise<void> {
    const cards = [
      {
        id: "scan-card-apple",
        wordText: "apple",
        meaning: "苹果",
        example: "I eat an apple every day.",
        imagePrompt: "a red apple",
        status: "pending",
        createdAt: new Date().toISOString(),
      },
      {
        id: "scan-card-banana",
        wordText: "banana",
        meaning: "香蕉",
        example: "The banana is yellow.",
        imagePrompt: "a yellow banana",
        status: "pending",
        createdAt: new Date().toISOString(),
      },
    ];
    const confirmed = new Set<string>();

    await this.page.route("**/api/scan/recognize", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          cards,
          recognized: true,
          model: "mock-scan",
        }),
      }),
    );

    await this.page.route("**/api/scan/confirm", async (route) => {
      let ids: string[] = [];
      try {
        const post = route.request().postData();
        if (post) ids = (JSON.parse(post).ids as string[]) ?? [];
      } catch {
        /* best-effort */
      }
      ids.forEach((id) => confirmed.add(id));
      const saved = cards
        .filter((c) => confirmed.has(c.id))
        .map((c) => ({ ...c, status: "saved" as const }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(saved),
      });
    });

    await this.page.route("**/api/scan", (route) => {
      const saved = cards
        .filter((c) => confirmed.has(c.id))
        .map((c) => ({ ...c, status: "saved" as const }));
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(saved),
      });
    });
  }

  /** 等待识别卡片出现，并记录单词列表。 */
  async waitForCards(): Promise<void> {
    const list = this.page.locator('[data-component="ScanCardList"]');
    await list.waitFor({ timeout: 15000 });
    const items = this.page.locator('[data-component="ScanCardItem"]');
    const count = await items.count();
    if (count < 1) {
      throw new Error("Expected at least 1 recognized word card");
    }
    this.lastWords = [];
    for (let i = 0; i < count; i++) {
      // 卡片首项为英文单词标题（独立 <span>），避免 textContent 拼接释义干扰
      const word = (
        (await items.nth(i).locator("span").first().textContent()) ?? ""
      ).trim();
      if (word) this.lastWords.push(word);
    }
  }

  /** 点击「全部加入生词本」。 */
  async clickAddAll(): Promise<void> {
    await this.page.locator('[data-component="ScanAddAllBtn"]').click();
    // 等待生词本出现至少一项（加入成功）
    await this.page
      .locator('[data-component="VocabWordItem"]')
      .first()
      .waitFor({ timeout: 15000 });
  }

  /** 断言生词本包含至少一个本次识别出的单词。
   * @param expectedWords 本次识别出的单词（跨 step 由 world 共享传来）
   */
  async vocabContainsWord(expectedWords: string[]): Promise<void> {
    const items = this.page.locator('[data-component="VocabWordItem"]');
    const count = await items.count();
    if (count < 1) {
      throw new Error("Expected vocab book to contain at least 1 word");
    }
    const known = new Set(expectedWords.map((w) => w.toLowerCase()));
    let matched = false;
    const collected: string[] = [];
    for (let i = 0; i < count; i++) {
      const wt = (await items.nth(i).getAttribute("data-word-text")) ?? "";
      collected.push(wt);
      if (known.has(wt.toLowerCase())) matched = true;
    }
    if (!matched) {
      throw new Error(
        `vocab book words [${collected.join(", ")}] do not contain any recognized word [${expectedWords.join(", ")}]`,
      );
    }
  }
}
