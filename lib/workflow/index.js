const service = require("./service");
const model = require("./model");
const templates = require("./templates");
const exporter = require("./exporter");
const diagnostics = require("./diagnostics");
const importSource = require("./import-source");
const projects = require("./projects");

module.exports = {
  ...service,
  ...model,
  ...templates,
  ...exporter,
  ...diagnostics,
  ...importSource,
  ...projects,
};
