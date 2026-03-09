const path = require("path");
const { app, BrowserWindow, clipboard, dialog, ipcMain, shell } = require("electron");
const workflowService = require("../lib/desktop-service");

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#10131f",
    icon: path.join(__dirname, "assets", process.platform === "win32" ? "icon.ico" : "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function getDefaultOutputRoot() {
  return path.join(app.getPath("documents"), "FengToolboxProjects");
}

function getProjectLibraryRoot() {
  return path.join(app.getPath("userData"), "studio-projects");
}

function registerIpcHandlers() {
  ipcMain.handle("system:get-meta", async () => {
    return {
      appName: "风的工具箱",
      appVersion: app.getVersion(),
      platform: process.platform,
      defaultOutputRoot: getDefaultOutputRoot(),
      projectLibraryRoot: getProjectLibraryRoot(),
    };
  });

  ipcMain.handle("workflow:get-catalog", async () => {
    return workflowService.getCatalog();
  });

  ipcMain.handle("workflow:get-settings", async () => {
    return workflowService.getSettings(getProjectLibraryRoot());
  });

  ipcMain.handle("workflow:save-settings", async (_, settings) => {
    return workflowService.updateSettings(getProjectLibraryRoot(), settings || {});
  });

  ipcMain.handle("dialog:choose-import-file", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择抓包文件",
      properties: ["openFile"],
      filters: [
        { name: "Import Files", extensions: ["har", "txt", "json"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle("dialog:choose-workflow-file", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择流程文件",
      properties: ["openFile"],
      filters: [
        { name: "Workflow Files", extensions: ["json"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle("dialog:save-workflow-file", async (_, suggestedPath) => {
    const result = await dialog.showSaveDialog({
      title: "导出流程文件",
      defaultPath: suggestedPath || path.join(getDefaultOutputRoot(), "workflow.fengflow.json"),
      filters: [
        { name: "Workflow Files", extensions: ["json"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    return result.filePath;
  });

  ipcMain.handle("dialog:choose-output-dir", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择输出目录",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle("workflow:list-projects", async () => {
    return workflowService.listProjects(getProjectLibraryRoot());
  });

  ipcMain.handle("workflow:create-project", async (_, options) => {
    return workflowService.createProject(getProjectLibraryRoot(), options || {});
  });

  ipcMain.handle("workflow:analyze-url", async (_, options) => {
    return workflowService.analyzeUrl(getProjectLibraryRoot(), options || {});
  });

  ipcMain.handle("workflow:load-project", async (_, projectId) => {
    return workflowService.loadStoredProject(getProjectLibraryRoot(), projectId);
  });

  ipcMain.handle("workflow:save-project", async (_, payload) => {
    return workflowService.saveStoredProject(
      getProjectLibraryRoot(),
      payload && payload.projectId ? payload.projectId : null,
      payload && payload.workflow ? payload.workflow : {}
    );
  });

  ipcMain.handle("workflow:create-preset-step", async (_, options) => {
    return workflowService.createPresetStep(options || {});
  });

  ipcMain.handle("workflow:import-source", async (_, options) => {
    return workflowService.importSource(getProjectLibraryRoot(), options || {});
  });

  ipcMain.handle("workflow:export-file", async (_, payload) => {
    return {
      filePath: workflowService.exportFile(
        payload && payload.workflow ? payload.workflow : {},
        payload && payload.filePath ? payload.filePath : ""
      ),
    };
  });

  ipcMain.handle("workflow:generate-project", async (_, payload) => {
    return workflowService.generateProject(getProjectLibraryRoot(), payload || {});
  });

  ipcMain.handle("workflow:preview-export", async (_, payload) => {
    return workflowService.previewExport(
      payload && payload.workflow ? payload.workflow : {},
      {
        outputDir: payload && payload.outputDir ? payload.outputDir : "",
        settings: workflowService.getSettings(getProjectLibraryRoot()),
      }
    );
  });

  ipcMain.handle("workflow:run", async (_, payload) => {
    return workflowService.runWorkflow(getProjectLibraryRoot(), payload || {});
  });

  ipcMain.handle("workflow:pause", async (_, payload) => {
    return workflowService.pauseWorkflow(
      getProjectLibraryRoot(),
      payload && payload.projectId ? payload.projectId : "",
      payload && payload.workflow ? payload.workflow : null
    );
  });

  ipcMain.handle("workflow:resume", async (_, payload) => {
    return workflowService.resumeWorkflow(
      getProjectLibraryRoot(),
      payload && payload.projectId ? payload.projectId : "",
      payload && payload.workflow ? payload.workflow : null
    );
  });

  ipcMain.handle("workflow:stop", async (_, payload) => {
    return workflowService.stopWorkflow(
      getProjectLibraryRoot(),
      payload && payload.projectId ? payload.projectId : "",
      payload && payload.workflow ? payload.workflow : null
    );
  });

  ipcMain.handle("workflow:get-run-history", async (_, payload) => {
    return workflowService.listRunHistory(
      getProjectLibraryRoot(),
      payload && payload.projectId ? payload.projectId : ""
    );
  });

  ipcMain.handle("shell:open-path", async (_, targetPath) => {
    if (!targetPath) {
      return false;
    }
    const error = await shell.openPath(String(targetPath));
    return error === "";
  });

  ipcMain.handle("system:copy-text", async (_, text) => {
    clipboard.writeText(String(text || ""));
    return true;
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
