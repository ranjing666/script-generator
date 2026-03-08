const { contextBridge, ipcRenderer } = require("electron");

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload);
}

contextBridge.exposeInMainWorld("desktopApi", {
  getMeta() {
    return invoke("system:get-meta");
  },
  chooseImportFile() {
    return invoke("dialog:choose-import-file");
  },
  chooseOutputDir() {
    return invoke("dialog:choose-output-dir");
  },
  listManualPresets(accountSource) {
    return invoke("manual:list-presets", accountSource);
  },
  getManualDefaults() {
    return invoke("manual:get-defaults");
  },
  analyzeImport(options) {
    return invoke("import:analyze", options);
  },
  detectImportSourceType(inputPath) {
    return invoke("import:detect-source", inputPath);
  },
  generateManualProject(options) {
    return invoke("project:generate-manual", options);
  },
  previewManualProject(options) {
    return invoke("project:preview-manual", options);
  },
  generateImportProject(options) {
    return invoke("project:generate-import", options);
  },
  previewImportProject(options) {
    return invoke("project:preview-import", options);
  },
  openPath(targetPath) {
    return invoke("shell:open-path", targetPath);
  },
  copyText(text) {
    return invoke("system:copy-text", text);
  },
});
