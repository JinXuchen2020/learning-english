// Custom Cucumber World: holds the Playwright browser/page for each scenario.
import { setWorldConstructor, World, IWorldOptions } from "@cucumber/cucumber";
import { BrowserContext, Page } from "@playwright/test";

export interface TestUser {
  username: string;
  password: string;
  nickname: string;
}

export default class E2EWorld extends World {
  // Playwright handles, assigned by hooks.ts
  context!: BrowserContext;
  page!: Page;
  // Frontend base URL (override with BASE_URL env when running against a different host)
  baseUrl: string;
  // Credentials of the user created during a scenario (set by register steps)
  testUser: TestUser | null = null;
  // AI-308: id of the speaking (mic) daily task clicked on Home, shared across
  // steps so the completion-write-back assertion can find the right card.
  speakingTaskId: string | null = null;
  // AI-606: 最近一次拍照识别出、待加入生词本的单词，跨 step 共享。
  scanWords: string[] = [];
  // AI-704: 补学种子写入的弱词文本 / 未完成计划日 id，跨 step 共享。
  makeupWordText: string | null = null;
  makeupPlanDayId: string | null = null;
  // AI-710: family-binding step 创建的孩子凭据（供 claim 场景跨 step 使用）。
  childCredentials: TestUser | null = null;
  // AI-712: family-dashboard step 创建的孩子（含 id，供下钻 / 跨 step 断言）。
  createdChildren: {
    nickname: string;
    username: string;
    password: string;
    id: string;
  }[] = [];
  // AI-712: 跨家长越权访问断言用的「上次 API 状态码」。
  lastApiStatus: number | null = null;
  // AI-711: 场景中创建的 provider 配置（name → id），跨 step 共享。
  providerConfigs: { name: string; id: string }[] = [];
  // AI-711: setChildProvider 的 HTTP 状态码（供断言 403 等）。
  assignStatus: number | null = null;
  // AI-801: 生成配套课程前记住的课程数量，跨 step 共享，用于断言「新课已出现」。
  coursesBefore: number | null = null;

  constructor(options: IWorldOptions) {
    super(options);
    this.baseUrl = process.env.BASE_URL || "http://localhost:3000";
  }
}

setWorldConstructor(E2EWorld);
