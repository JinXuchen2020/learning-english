// Cucumber configuration for the kids-english E2E suite.
// Run from the frontend package root (src/):  npm run e2e
module.exports = {
  default: {
    // Gherkin feature files
    paths: ["e2e/features/**/*.feature"],
    // Step definitions + support (page objects, hooks, world)
    require: [
      "e2e/support/**/*.js",
      "e2e/step-definitions/**/*.js",
    ],
    // Reporters: concise progress + a readable summary
    format: ["progress", "summary"],
    // Fail fast is off so we see every scenario result
    failFast: false,
    // Resolve require paths relative to this config file's directory
    requireModule: [],
  },
};
