const service = require("./service");
const model = require("./model");
const templates = require("./templates");
const exporter = require("./exporter");
const diagnostics = require("./diagnostics");
const importSource = require("./import-source");
const projects = require("./projects");
const adapters = require("./adapters");
const settings = require("./settings");
const runtime = require("./runtime");
const urlAnalysis = require("./url-analysis");

module.exports = {
  ...service,
  ...model,
  ...templates,
  ...exporter,
  ...diagnostics,
  ...importSource,
  ...projects,
  ...adapters,
  ...settings,
  ...runtime,
  ...urlAnalysis,
};
