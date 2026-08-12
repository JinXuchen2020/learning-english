// Cucumber configuration to run ONLY the AI-708 responsive-layout feature.
// Mirrors e2e/cucumber.parent.js but restricts `paths` to the responsive feature.
// Reuses the same support code + shared steps (login, common).
const path = require("path");

module.exports = {
  default: {
    paths: [path.join(__dirname, "features", "responsive.feature")],
    requireModule: ["tsx/cjs"],
    require: [
      path.join(__dirname, "support", "**", "*.ts"),
      path.join(__dirname, "step-definitions", "**", "*.ts"),
    ],
    format: ["progress", "summary"],
    failFast: false,
  },
};
