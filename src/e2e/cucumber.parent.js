// Cucumber configuration to run ONLY the AI-702 parent-mode feature.
// Mirrors e2e/cucumber.rewards.js but restricts `paths` to the parent feature.
// Reuses the same support code + shared steps (login, daily task completion).
const path = require("path");

module.exports = {
  default: {
    paths: [path.join(__dirname, "features", "parent.feature")],
    requireModule: ["tsx/cjs"],
    require: [
      path.join(__dirname, "support", "**", "*.ts"),
      path.join(__dirname, "step-definitions", "**", "*.ts"),
    ],
    format: ["progress", "summary"],
    failFast: false,
  },
};
