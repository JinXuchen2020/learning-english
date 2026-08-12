// Cucumber configuration to run ONLY the AI-705 parent provider-config feature.
// Mirrors e2e/cucumber.parent.js but restricts `paths` to the provider-config feature.
const path = require("path");

module.exports = {
  default: {
    paths: [path.join(__dirname, "features", "parent-provider-config.feature")],
    requireModule: ["tsx/cjs"],
    require: [
      path.join(__dirname, "support", "**", "*.ts"),
      path.join(__dirname, "step-definitions", "**", "*.ts"),
    ],
    format: ["progress", "summary"],
    failFast: false,
  },
};
