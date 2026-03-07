const path = require("path");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const desktopService = require("../lib/desktop-service");

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#0d1117",
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

function registerIpcHandlers() {
  ipcMain.handle("system:get-meta", async () => {
    return {
      appName: "风的工具箱v1.1.0",
      appVersion: app.getVersion(),
      platform: process.platform,
      defaultOutputRoot: getDefaultOutputRoot(),
    };
  });

  ipcMain.handle("dialog:choose-import-file", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择导入文件",
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

  ipcMain.handle("manual:list-presets", async (_, accountSource) => {
    return desktopService.listPresets(accountSource);
  });

  ipcMain.handle("manual:get-defaults", async () => {
    return desktopService.getManualDefaults();
  });

  ipcMain.handle("import:analyze", async (_, options) => {
    return desktopService.analyzeImport(options || {});
  });

  ipcMain.handle("import:detect-source", async (_, inputPath) => {
    return desktopService.detectImportSourceType(inputPath);
  });

  ipcMain.handle("project:generate-manual", async (_, options) => {
    return desktopService.generateManualProject({
      ...(options || {}),
      defaultOutputRoot: getDefaultOutputRoot(),
    });
  });

  ipcMain.handle("project:generate-import", async (_, options) => {
    return desktopService.generateImportProject({
      ...(options || {}),
      defaultOutputRoot: getDefaultOutputRoot(),
    });
  });

  ipcMain.handle("shell:open-path", async (_, targetPath) => {
    if (!targetPath) {
      return false;
    }
    const error = await shell.openPath(String(targetPath));
    return error === "";
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
