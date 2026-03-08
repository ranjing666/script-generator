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
  loadProject(projectId) {
    return invoke("workflow:load-project", projectId);
  },
  saveProject(payload) {
    return invoke("workflow:save-project", payload);
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
  openPath(targetPath) {
    return invoke("shell:open-path", targetPath);
  },
  copyText(text) {
    return invoke("system:copy-text", text);
  },
});
