// Cucumber configuration to run ONLY the AI-709 more-drawer feature.
// Mirrors e2e/cucumber.parent.js but restricts `paths` to the more-drawer feature.
// Reuses the same support code + shared steps (login, common).
const path = require("path");

module.exports = {
  default: {
    paths: [path.join(__dirname, "features", "more-drawer.feature")],
    requireModule: ["tsx/cjs"],
    require: [
      path.join(__dirname, "support", "**", "*.ts"),
      path.join(__dirname, "step-definitions", "**", "*.ts"),
    ],
    format: ["progress", "summary"],
    failFast: false,
  },
};
