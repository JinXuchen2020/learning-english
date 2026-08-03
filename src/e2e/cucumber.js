// Cucumber configuration for the kids-english E2E suite.
// Run from the frontend package root (src/):  npm run e2e
//
// The support code (page objects, hooks, world) and step definitions are
// written in TypeScript. tsx (requireModule below) registers a require hook for
// .ts files so Cucumber can load them directly — no separate compile step.
const path = require("path");

module.exports = {
  default: {
    // Gherkin feature files
    paths: [path.join(__dirname, "features", "**", "*.feature")],
    // TypeScript support: tsx registers a require hook for .ts files.
    requireModule: ["tsx/cjs"],
    // Step definitions + support (page objects, hooks, world)
    require: [
      path.join(__dirname, "support", "**", "*.ts"),
      path.join(__dirname, "step-definitions", "**", "*.ts"),
    ],
    // Reporters: concise progress + a readable summary
    format: ["progress", "summary"],
    // Fail fast is off so we see every scenario result
    failFast: false,
  },
};
