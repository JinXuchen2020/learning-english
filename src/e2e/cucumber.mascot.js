// Cucumber configuration to run ONLY the AI-603 mascot-story feature.
// Mirrors e2e/cucumber.js but restricts `paths` to the single feature so we
// don't pay the cost of the full suite. Reuses the same support code + steps
// (so the shared "I am logged in as a new user" Given works).
const path = require("path");

module.exports = {
  default: {
    paths: [path.join(__dirname, "features", "mascot-story.feature")],
    requireModule: ["tsx/cjs"],
    require: [
      path.join(__dirname, "support", "**", "*.ts"),
      path.join(__dirname, "step-definitions", "**", "*.ts"),
    ],
    format: ["progress", "summary"],
    failFast: false,
  },
};
