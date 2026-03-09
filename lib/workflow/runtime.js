const fs = require("fs");
const path = require("path");
const { execFile, spawn } = require("child_process");
const { generateId, normalizeWorkflow, nowIso } = require("./model");

const activeRuns = new Map();

function getRunsDir(rootDir, projectId) {
  return path.join(path.resolve(String(rootDir || "")), String(projectId || ""), "runs");
}

function getHistoryPath(rootDir, projectId) {
  return path.join(getRunsDir(rootDir, projectId), "history.json");
}

function ensureRunsDir(rootDir, projectId) {
  const target = getRunsDir(rootDir, projectId);
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function readHistory(rootDir, projectId) {
  const historyPath = getHistoryPath(rootDir, projectId);
  if (!fs.existsSync(historyPath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(historyPath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(rootDir, projectId, history) {
  const historyPath = getHistoryPath(rootDir, projectId);
  ensureRunsDir(rootDir, projectId);
  fs.writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
}

function readLogTail(logPath, maxBytes = 6000) {
  if (!logPath || !fs.existsSync(logPath)) {
    return "";
  }

  const stat = fs.statSync(logPath);
  const start = Math.max(0, stat.size - maxBytes);
  const buffer = Buffer.alloc(stat.size - start);
  const fd = fs.openSync(logPath, "r");
  fs.readSync(fd, buffer, 0, buffer.length, start);
  fs.closeSync(fd);
  return buffer.toString("utf8");
}

function mapRunRecord(record) {
  return {
    ...record,
    logTail: readLogTail(record.logPath),
  };
}

function upsertHistoryRecord(rootDir, projectId, record) {
  const history = readHistory(rootDir, projectId);
  const next = history.filter((item) => item.runId !== record.runId);
  next.unshift({
    ...record,
    updatedAt: nowIso(),
  });
  writeHistory(rootDir, projectId, next.slice(0, 30));
}

function appendLog(record, chunk) {
  ensureRunsDir(record.rootDir, record.projectId);
  fs.appendFileSync(record.logPath, String(chunk || ""), "utf8");
}

function requireGeneratedWorkspace(outputDir) {
  const mainPath = path.join(outputDir, "main.js");
  const packageJsonPath = path.join(outputDir, "package.json");
  const nodeModulesPath = path.join(outputDir, "node_modules");
  if (!fs.existsSync(mainPath)) {
    throw new Error("应用内运行需要先生成项目，并且输出目录里要有 main.js。");
  }
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error("当前输出目录不是完整的生成项目。请先点击“生成项目”。");
  }
  if (!fs.existsSync(nodeModulesPath)) {
    throw new Error("输出目录还没安装依赖。先双击 1-双击-安装依赖.bat，或者在项目目录执行 npm install。");
  }
  return {
    mainPath,
    packageJsonPath,
  };
}

function runCommand(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message || String(error)));
        return;
      }
      resolve(stdout);
    });
  });
}

async function suspendProcess(pid) {
  if (process.platform === "win32") {
    await runCommand("powershell", ["-NoProfile", "-Command", `Suspend-Process -Id ${Number(pid)}`]);
    return;
  }

  process.kill(pid, "SIGSTOP");
}

async function resumeProcess(pid) {
  if (process.platform === "win32") {
    await runCommand("powershell", ["-NoProfile", "-Command", `Resume-Process -Id ${Number(pid)}`]);
    return;
  }

  process.kill(pid, "SIGCONT");
}

async function terminateProcess(pid) {
  if (process.platform === "win32") {
    await runCommand("taskkill", ["/PID", String(pid), "/T", "/F"]);
    return;
  }

  process.kill(pid, "SIGTERM");
}

function getActiveRun(projectId) {
  return activeRuns.get(String(projectId || "")) || null;
}

function getRunWorkspace(options = {}) {
  const workflow = normalizeWorkflow(options.workflow || {});
  const rawOutputDir = String(options.outputDir || workflow.project.lastOutputDir || workflow.project.outputDir || "").trim();
  if (!rawOutputDir) {
    throw new Error("当前流程还没有生成目录。请先点击“生成项目”。");
  }

  const outputDir = path.resolve(rawOutputDir);
  const workspace = requireGeneratedWorkspace(outputDir);

  return {
    workflow,
    outputDir,
    entrypoint: workspace.mainPath,
    packageJsonPath: workspace.packageJsonPath,
  };
}

function notifyRecordChange(active) {
  if (!active || typeof active.onRecordChange !== "function") {
    return;
  }

  try {
    active.onRecordChange({
      ...active.record,
    });
  } catch {
    // Ignore callback failures so runtime control is not blocked by persistence issues.
  }
}

function finalizeRun(projectId, active, patch = {}) {
  if (!active || active.settled) {
    return;
  }

  active.settled = true;
  const hasExplicitStatus = Object.prototype.hasOwnProperty.call(patch, "status");
  const hasExplicitSummary = Object.prototype.hasOwnProperty.call(patch, "summary");
  Object.assign(active.record, patch);
  active.record.finishedAt = active.record.finishedAt || nowIso();

  if (!hasExplicitStatus) {
    if (active.record.requestedAction === "stop") {
      active.record.status = "stopped";
    } else if (active.record.exitCode === 0) {
      active.record.status = "completed";
    } else {
      active.record.status = "failed";
    }
  }
  if (!hasExplicitSummary) {
    if (active.record.status === "stopped") {
      active.record.summary = "已手动停止";
    } else if (active.record.status === "completed") {
      active.record.summary = "运行完成";
    } else if (active.record.status === "failed") {
      active.record.summary = `运行失败${active.record.exitCode != null ? `，退出码 ${active.record.exitCode}` : ""}`;
    }
  }

  appendLog(
    active.record,
    `\n\n=== 运行结束 ===\n结束时间: ${active.record.finishedAt}\n状态: ${active.record.status}\n摘要: ${active.record.summary}\n`
  );
  upsertHistoryRecord(active.record.rootDir, active.record.projectId, active.record);
  notifyRecordChange(active);
  activeRuns.delete(String(projectId || ""));
}

function startRun(rootDir, options = {}) {
  const projectId = String(options.projectId || "");
  if (!projectId) {
    throw new Error("缺少 projectId，无法启动运行。");
  }

  const existing = getActiveRun(projectId);
  if (existing && ["running", "paused", "stopping"].includes(existing.record.status)) {
    throw new Error("当前项目已经有一个运行实例，请先停止或恢复它。");
  }

  const workspace = getRunWorkspace(options);
  const runId = generateId("run");
  const logPath = path.join(ensureRunsDir(rootDir, projectId), `${runId}.log`);
  const record = {
    runId,
    rootDir,
    projectId,
    status: "running",
    startedAt: nowIso(),
    finishedAt: "",
    outputDir: workspace.outputDir,
    entrypoint: workspace.entrypoint,
    command: `${process.execPath} main.js`,
    pid: 0,
    exitCode: null,
    signal: "",
    requestedAction: "",
    logPath,
    summary: "运行中",
  };

  fs.writeFileSync(logPath, `风的工具箱应用内运行\n开始时间: ${record.startedAt}\n输出目录: ${record.outputDir}\n\n`, "utf8");
  const child = spawn(process.execPath, ["main.js"], {
    cwd: workspace.outputDir,
    env: process.env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  record.pid = child.pid || 0;
  upsertHistoryRecord(rootDir, projectId, record);

  const active = {
    child,
    record,
    onRecordChange: typeof options.onRecordChange === "function" ? options.onRecordChange : null,
    settled: false,
  };
  activeRuns.set(projectId, active);
  notifyRecordChange(active);

  child.stdout.on("data", (chunk) => {
    appendLog(record, chunk);
  });

  child.stderr.on("data", (chunk) => {
    appendLog(record, chunk);
  });

  child.on("error", (error) => {
    appendLog(record, `\n[runner-error] ${error.message || String(error)}\n`);
    finalizeRun(projectId, active, {
      status: "failed",
      summary: `启动失败: ${error.message || String(error)}`,
      exitCode: null,
      signal: "",
    });
  });

  child.on("exit", (code, signal) => {
    record.exitCode = Number.isInteger(code) ? code : null;
    record.signal = signal || "";
    finalizeRun(projectId, active);
  });

  return mapRunRecord(record);
}

async function pauseRun(rootDir, projectId) {
  const active = getActiveRun(projectId);
  if (!active || active.record.status !== "running") {
    throw new Error("当前没有可暂停的运行实例。");
  }

  await suspendProcess(active.record.pid);
  active.record.status = "paused";
  active.record.summary = "已暂停";
  upsertHistoryRecord(rootDir, projectId, active.record);
  notifyRecordChange(active);
  return mapRunRecord(active.record);
}

async function resumeRun(rootDir, projectId) {
  const active = getActiveRun(projectId);
  if (!active || active.record.status !== "paused") {
    throw new Error("当前没有可恢复的暂停实例。");
  }

  await resumeProcess(active.record.pid);
  active.record.status = "running";
  active.record.summary = "已恢复运行";
  upsertHistoryRecord(rootDir, projectId, active.record);
  notifyRecordChange(active);
  return mapRunRecord(active.record);
}

async function stopRun(rootDir, projectId) {
  const active = getActiveRun(projectId);
  if (!active || !["running", "paused"].includes(active.record.status)) {
    throw new Error("当前没有可停止的运行实例。");
  }

  if (active.record.status === "paused") {
    await resumeProcess(active.record.pid);
  }
  active.record.requestedAction = "stop";
  active.record.status = "stopping";
  active.record.summary = "正在停止";
  upsertHistoryRecord(rootDir, projectId, active.record);
  notifyRecordChange(active);
  await terminateProcess(active.record.pid);
  return mapRunRecord(active.record);
}

function getRunHistory(rootDir, projectId) {
  const history = readHistory(rootDir, projectId).map(mapRunRecord);
  const active = getActiveRun(projectId);
  if (!active) {
    return history;
  }

  const next = history.filter((item) => item.runId !== active.record.runId);
  next.unshift(mapRunRecord(active.record));
  return next;
}

module.exports = {
  startRun,
  pauseRun,
  resumeRun,
  stopRun,
  getRunHistory,
};
