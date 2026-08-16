// Cucumber configuration to run ONLY the AI-710 family-binding feature.
const path = require("path");

module.exports = {
  default: {
    paths: [path.join(__dirname, "features", "family-binding.feature")],
    requireModule: ["tsx/cjs"],
    require: [
      path.join(__dirname, "support", "**", "*.ts"),
      path.join(__dirname, "step-definitions", "**", "*.ts"),
    ],
    format: ["progress", "summary"],
    failFast: false,
  },
};
