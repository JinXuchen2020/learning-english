// Page object for the parent weekly report dashboard (src/app/parent-report/page.tsx).
// Key regions carry data-component hooks:
//   ParentReport / ReportHeader / WeekNav(WeekPrev,WeekNext,WeekLabel) /
//   MetricsGrid(MetricCard) / TrendSection(TrendChart) /
//   WeakWordsSection(WeakWordsList,WeakWordItem[data-weak-word]) / SuggestionsSection(SuggestionsList,SuggestionItem)
import { Locator, Page } from "@playwright/test";

function addDaysUTC(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

export default class ParentReportPage {
  private page: Page;
  private baseUrl: string;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  /** Mock `GET /api/ai/report/weekly/preview` 返回一份固定周报。
   *  回显请求中的 weekStart（无则默认 2026-08-03），使周切换后 label 反映真实请求周。 */
  async mockWeeklyReport(weakWordsCsv: string, suggestionsCsv: string): Promise<void> {
    const weakWords = weakWordsCsv
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean);
    const suggestions = suggestionsCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // 7 天趋势点（与图表断言对应：7 根柱）。
    const baseWs = "2026-08-03";
    const trendDates = Array.from({ length: 7 }, (_, i) => addDaysUTC(baseWs, i));
    const taskComplete = [2, 3, 1, 4, 0, 2, 0];
    const score = [70, 80, null, 85, 72, null, 90];
    const masteryTrend = trendDates.map((date, i) => ({
      date,
      taskComplete: taskComplete[i],
      avgSpeechScore: score[i],
    }));

    await this.page.route("**/api/ai/report/weekly/preview**", (route) => {
      const url = new URL(route.request().url());
      const ws = url.searchParams.get("weekStart") || baseWs;
      const we = addDaysUTC(ws, 6);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "test-user",
          childName: "小明",
          weekStart: ws,
          weekEnd: we,
          metrics: {
            activeDays: 5,
            totalTasksCompleted: 12,
            totalWordsPracticed: 20,
            totalLessonsCompleted: 3,
            totalSpeechAttempts: 8,
            avgSpeechScore: 78,
          },
          weakWordsTop: weakWords,
          masteryTrend,
          dailySummaries: [],
          suggestions,
          html: "",
        }),
      });
    });
  }

  /** 经 TabNav 客户端点击进入家长报告页（保住内存 token，AuthGate 页禁 page.goto）。 */
  async openPage(): Promise<void> {
    const link = this.page.locator('nav a[href="/parent-report"]');
    if ((await link.count()) === 0) {
      throw new Error("TabNav 中未找到家长报告入口 (a[href='/parent-report'])");
    }
    await link.first().click();
    // 等待页面装载并数据返回（指标卡出现即代表已脱离 loading）。
    await this.page.waitForSelector('[data-component="ParentReport"]', { timeout: 15000 });
    await this.page.waitForSelector('[data-component="MetricCard"]', { timeout: 15000 });
  }

  async trendChartVisible(): Promise<boolean> {
    const chart = this.page.locator('[data-component="TrendChart"]').first();
    if ((await chart.count()) === 0) return false;
    // 至少渲染 7 根趋势柱（data-bar="task"）。
    const bars = await this.page.locator('[data-component="TrendChart"] [data-bar="task"]').count();
    return bars >= 7;
  }

  async metricCardCount(): Promise<number> {
    return this.page.locator('[data-component="MetricCard"]').count();
  }

  async weakWordsText(): Promise<string | undefined> {
    return (await this.page.locator('[data-component="WeakWordsList"]').textContent())?.trim();
  }

  async suggestionVisible(text: string): Promise<boolean> {
    const items = this.page.locator('[data-component="SuggestionItem"]');
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      const t = (await items.nth(i).textContent())?.trim();
      if (t && t.includes(text)) return true;
    }
    return false;
  }

  /** 点击弱项单词 → 客户端导航到 /practice?focusWord=<word>。
   *  该链接是 Next <Link>，点击即客户端导航并卸载本页（链接元素随之 detached）。
   *  用 force:true 跳过"稳定/可见"动作性检查，直接派发点击让 router.push 生效，
   *  否则 Playwright 在导航卸载元素时会报 "element was detached from the DOM"。 */
  async clickWeakWord(word: string): Promise<void> {
    const link = this.page.locator(
      `[data-component="WeakWordItem"][data-weak-word="${word}"] a`,
    );
    if ((await link.count()) === 0) {
      throw new Error(`弱项单词 "${word}" 的下钻链接未找到`);
    }
    await link.first().click({ force: true });
  }

  /** 点击弱项单词并等待练习页聚焦该词，返回练习页当前单词文本。 */
  async drillDownToPractice(word: string): Promise<string> {
    await this.clickWeakWord(word);
    await this.page.waitForSelector('[data-component="QuizWordText"]', { timeout: 15000 });
    const text = (await this.page.locator('[data-component="QuizWordText"]').first().textContent())?.trim();
    return text ?? "";
  }

  async clickPrevWeek(): Promise<void> {
    await this.page.locator('[data-component="WeekPrev"]').first().click();
    // 等待新周数据装载（指标卡重新出现）。
    await this.page.waitForSelector('[data-component="MetricCard"]', { timeout: 15000 });
  }

  async weekLabelText(): Promise<string | undefined> {
    return (await this.page.locator('[data-component="WeekLabel"]').first().textContent())?.trim();
  }
}
