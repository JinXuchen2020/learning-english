// Focused Cucumber config: runs only the AI-704 makeup feature.
// Usage (from src/):  node ../../server/node_modules/.bin/ts-node ...  OR simply:
//   npx cucumber-js --config e2e/cucumber.makeup.js
// Keeps the same support code + step definitions as the full suite.
const path = require("path");

module.exports = {
  default: {
    paths: [path.join(__dirname, "features", "makeup.feature")],
    requireModule: ["tsx/cjs"],
    require: [
      path.join(__dirname, "support", "**", "*.ts"),
      path.join(__dirname, "step-definitions", "**", "*.ts"),
    ],
    format: ["progress", "summary"],
    failFast: false,
  },
};
