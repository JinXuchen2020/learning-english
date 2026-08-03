// Custom Cucumber World: holds the Playwright browser/page for each scenario.
const { setWorldConstructor, World } = require("@cucumber/cucumber");

class E2EWorld extends World {
  constructor(options) {
    super(options);
    // Playwright handles, assigned by hooks.js
    this.browser = null;
    this.context = null;
    this.page = null;
    // Frontend base URL (override with BASE_URL env when running against a different host)
    this.baseUrl = process.env.BASE_URL || "http://localhost:3000";
    // Credentials of the user created during a scenario (set by register steps)
    this.testUser = null;
  }
}

setWorldConstructor(E2EWorld);
