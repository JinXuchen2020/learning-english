// Cucumber configuration to run ONLY the AI-712 family-dashboard feature.
// Mirrors e2e/cucumber.parent.js but restricts `paths` to the family-dashboard feature.
// Reuses the same support code + shared steps (login, daily task completion, seed).
const path = require("path");

module.exports = {
  default: {
    paths: [path.join(__dirname, "features", "family-dashboard.feature")],
    requireModule: ["tsx/cjs"],
    require: [
      path.join(__dirname, "support", "**", "*.ts"),
      path.join(__dirname, "step-definitions", "**", "*.ts"),
    ],
    format: ["progress", "summary"],
    failFast: false,
  },
};
