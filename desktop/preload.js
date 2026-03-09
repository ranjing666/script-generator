const { contextBridge, ipcRenderer } = require("electron");

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload);
}

contextBridge.exposeInMainWorld("desktopApi", {
  getMeta() {
    return invoke("system:get-meta");
  },
  getWorkflowCatalog() {
    return invoke("workflow:get-catalog");
  },
  getSettings() {
    return invoke("workflow:get-settings");
  },
  saveSettings(settings) {
    return invoke("workflow:save-settings", settings);
  },
  chooseImportFile() {
    return invoke("dialog:choose-import-file");
  },
  chooseWorkflowFile() {
    return invoke("dialog:choose-workflow-file");
  },
  saveWorkflowFileDialog(suggestedPath) {
    return invoke("dialog:save-workflow-file", suggestedPath);
  },
  chooseOutputDir() {
    return invoke("dialog:choose-output-dir");
  },
  listProjects() {
    return invoke("workflow:list-projects");
  },
  createProject(options) {
    return invoke("workflow:create-project", options);
  },
  analyzeUrl(options) {
    return invoke("workflow:analyze-url", options);
  },
  loadProject(projectId) {
    return invoke("workflow:load-project", projectId);
  },
  saveProject(payload) {
    return invoke("workflow:save-project", payload);
  },
  createPresetStep(options) {
    return invoke("workflow:create-preset-step", options);
  },
  importSource(options) {
    return invoke("workflow:import-source", options);
  },
  exportWorkflowFile(payload) {
    return invoke("workflow:export-file", payload);
  },
  generateProject(payload) {
    return invoke("workflow:generate-project", payload);
  },
  previewWorkflowExport(payload) {
    return invoke("workflow:preview-export", payload);
  },
  runWorkflow(payload) {
    return invoke("workflow:run", payload);
  },
  pauseWorkflow(payload) {
    return invoke("workflow:pause", payload);
  },
  resumeWorkflow(payload) {
    return invoke("workflow:resume", payload);
  },
  stopWorkflow(payload) {
    return invoke("workflow:stop", payload);
  },
  getRunHistory(payload) {
    return invoke("workflow:get-run-history", payload);
  },
  openPath(targetPath) {
    return invoke("shell:open-path", targetPath);
  },
  copyText(text) {
    return invoke("system:copy-text", text);
  },
});
