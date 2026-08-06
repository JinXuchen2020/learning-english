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

  constructor(options: IWorldOptions) {
    super(options);
    this.baseUrl = process.env.BASE_URL || "http://localhost:3000";
  }
}

setWorldConstructor(E2EWorld);
