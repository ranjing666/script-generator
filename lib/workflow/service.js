const fs = require("fs");
const path = require("path");
const { TASK_PRESETS, getAvailablePresets } = require("../presets");
const { listAdapters } = require("./adapters");
const { buildWorkflowFromImportedSource, detectImportSourceType } = require("./import-source");
const { computeWorkflowDiagnostics } = require("./diagnostics");
const { exportWorkflowFile, generateWorkflowProject, loadWorkflowFile, previewWorkflowExport } = require("./exporter");
const { clone, createBlankWorkflow, createWorkflowStep, getStepCatalog, normalizeWorkflow } = require("./model");
const { ensureLibraryRoot, loadProject, listProjects, mapProjectSummary, saveProject } = require("./projects");
const { startRun, pauseRun, resumeRun, stopRun, getRunHistory } = require("./runtime");
const { loadSettings, normalizeSettings, saveSettings } = require("./settings");
const { createWorkflowFromTemplate, listWorkflowTemplates } = require("./templates");
const { analyzeUrlToWorkflow, deriveProjectNameFromUrl } = require("./url-analysis");

const ACCOUNT_SOURCE_OPTIONS = [
  { id: "accounts", label: "账号密码文件" },
  { id: "tokens", label: "Token 文件" },
  { id: "privateKeys", label: "钱包私钥文件" },
];

const AUTH_MODE_OPTIONS = [
  { id: "none", label: "不预置登录" },
  { id: "account_token", label: "直接读取 token" },
  { id: "request", label: "普通请求登录" },
  { id: "evm_sign", label: "钱包签名登录" },
];

function getProjectArtifactDir(rootDir, projectId) {
  return path.join(ensureLibraryRoot(rootDir), String(projectId || ""), "artifacts", "url-analysis");
}

function buildSettingsSnapshot(input) {
  return normalizeSettings(input || {});
}

function buildUrlArtifactSummary(analyzed) {
  const artifact = analyzed && analyzed.sourceArtifact && typeof analyzed.sourceArtifact === "object"
    ? analyzed.sourceArtifact
    : {};
  const analysis = analyzed && analyzed.analysis && typeof analyzed.analysis === "object"
    ? analyzed.analysis
    : {};
  const adapter = analyzed && analyzed.adapter && typeof analyzed.adapter === "object"
    ? analyzed.adapter
    : {};
  const review = analyzed && analyzed.review && typeof analyzed.review === "object"
    ? analyzed.review
    : {};

  return {
    generatedAt: new Date().toISOString(),
    sourceUrl: String(analysis.sourceUrl || artifact.sourceUrl || ""),
    title: String(analysis.title || artifact.title || ""),
    fetchMode: String(analysis.fetchMode || artifact.fetchMode || ""),
    fetchedAt: String(analysis.fetchedAt || artifact.fetchedAt || ""),
    host: String(artifact.host || ""),
    pathname: String(artifact.pathname || ""),
    headings: Array.isArray(artifact.headings) ? artifact.headings : [],
    buttons: Array.isArray(artifact.buttons) ? artifact.buttons : [],
    forms: Array.isArray(artifact.forms) ? artifact.forms : [],
    keywords: Array.isArray(artifact.keywords) ? artifact.keywords : [],
    warnings: Array.isArray(analysis.warnings) ? analysis.warnings : [],
    signals: Array.isArray(analysis.signals) ? analysis.signals : [],
    confidence: analysis.confidence || { score: 0, label: "未分析", notes: [] },
    adapter: {
      id: String(adapter.id || "manual"),
      label: String(adapter.label || "手动流程"),
      confidence: Number(adapter.confidence || 0),
    },
    review: {
      requiresHumanReview: Boolean(review.requiresHumanReview),
      reasons: Array.isArray(review.reasons) ? review.reasons : [],
    },
    textExcerpt: String(artifact.text || "").slice(0, 4000),
  };
}

function persistUrlAnalysisArtifacts(rootDir, projectId, analyzed, workflowHint) {
  if (!projectId || !analyzed) {
    return null;
  }

  const artifact = analyzed.sourceArtifact && typeof analyzed.sourceArtifact === "object"
    ? analyzed.sourceArtifact
    : null;
  const hasHtml = artifact && typeof artifact.html === "string" && artifact.html.trim().length > 0;
  const summary = buildUrlArtifactSummary(analyzed);
  const artifactDir = getProjectArtifactDir(rootDir, projectId);
  fs.mkdirSync(artifactDir, { recursive: true });

  const summaryPath = path.join(artifactDir, "summary.json");
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  let htmlPath = "";
  if (hasHtml) {
    htmlPath = path.join(artifactDir, "page.html");
    fs.writeFileSync(htmlPath, artifact.html, "utf8");
  }

  const workflow = normalizeWorkflow(workflowHint || analyzed.workflow || {});
  workflow.artifacts.analysisSummaryPath = summaryPath;
  workflow.artifacts.htmlSnapshotPath = htmlPath || workflow.artifacts.htmlSnapshotPath || "";
  workflow.meta.sourceMaterial = {
    ...(workflow.meta.sourceMaterial || {}),
    artifactDir,
    analysisSummaryPath: summaryPath,
    htmlSnapshotPath: workflow.artifacts.htmlSnapshotPath,
  };

  return saveProject(rootDir, workflow);
}

function persistRunState(rootDir, projectId, record, workflowHint = null) {
  if (!projectId || !record) {
    return null;
  }

  let workflow = null;
  try {
    workflow = loadProject(rootDir, projectId).workflow;
  } catch {
    if (!workflowHint) {
      return null;
    }
    workflow = normalizeWorkflow(workflowHint);
  }

  workflow.runtime.run.status = String(record.status || workflow.runtime.run.status || "idle");
  workflow.runtime.run.lastRunId = String(record.runId || workflow.runtime.run.lastRunId || "");
  workflow.project.lastOutputDir = String(record.outputDir || workflow.project.lastOutputDir || "");
  workflow.artifacts.lastRunLogPath = String(record.logPath || workflow.artifacts.lastRunLogPath || "");
  workflow.artifacts.generatedOutputDir = workflow.project.lastOutputDir || workflow.artifacts.generatedOutputDir;
  return saveProject(rootDir, workflow);
}

function getCatalog() {
  return {
    templates: listWorkflowTemplates(),
    stepCatalog: getStepCatalog(),
    adapters: listAdapters(),
    taskPresets: TASK_PRESETS.map((preset) => ({
      id: preset.id,
      label: preset.label,
      summary: preset.summary,
      requiresPrivateKey: Boolean(preset.requiresPrivateKey),
    })),
    accountSources: ACCOUNT_SOURCE_OPTIONS,
    authModes: AUTH_MODE_OPTIONS,
  };
}

function createPresetStep(options = {}) {
  const accountSource = options.accountSource || "accounts";
  const accountFields = Array.isArray(options.accountFields) ? options.accountFields : [];
  const authMode = options.authMode || "none";
  const preset = getAvailablePresets({ accountSource }).find((item) => item.id === options.presetId);

  if (!preset) {
    throw new Error("找不到这个任务积木，可能和当前账号来源不兼容。");
  }

  const task = preset.build({
    authMode,
    accountSource,
    accountFields,
  });

  return createWorkflowStep({
    type: task.type,
    title: preset.label,
    source: "manual",
    config: task,
    metadata: {
      presetId: preset.id,
      presetLabel: preset.label,
      presetSummary: preset.summary,
    },
  });
}

function createStoredBlankProject(rootDir, options = {}) {
  const workflow = createBlankWorkflow({
    projectName: options.projectName || "blank-workflow",
    sourceKind: "blank",
  });
  return saveProject(rootDir, workflow);
}

function createStoredTemplateProject(rootDir, options = {}) {
  const workflow = createWorkflowFromTemplate(options.templateId, {
    projectName: options.projectName,
  });
  return saveProject(rootDir, workflow);
}

function importWorkflowFile(rootDir, options = {}) {
  const loadedWorkflow = loadWorkflowFile(options.filePath);
  const importedWorkflow = normalizeWorkflow({
    ...loadedWorkflow,
    meta: {
      ...loadedWorkflow.meta,
      id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      sourceMaterial: {
        kind: "workflow-file",
        filePath: path.resolve(String(options.filePath || "")),
      },
    },
    project: {
      ...loadedWorkflow.project,
      name: options.projectName || loadedWorkflow.project.name,
    },
  });

  return saveProject(rootDir, importedWorkflow);
}

async function createStoredUrlProject(rootDir, options = {}) {
  const settings = buildSettingsSnapshot(options.settings || loadSettings(rootDir));
  const analyzed = await analyzeUrlToWorkflow({
    url: options.url,
    projectName: options.projectName || deriveProjectNameFromUrl(options.url),
    settings,
    html: options.html,
    title: options.title,
    preferPlaywright: options.preferPlaywright,
  });
  const workflow = normalizeWorkflow({
    ...analyzed.workflow,
    project: {
      ...analyzed.workflow.project,
      name: options.projectName || analyzed.workflow.project.name,
      concurrency: Number(options.concurrency || analyzed.workflow.project.concurrency || 1),
      repeat: Boolean(options.repeat),
      intervalMinutes: Number(options.intervalMinutes || analyzed.workflow.project.intervalMinutes || 60),
      useProxy: Boolean(options.useProxy),
    },
  });
  const saved = saveProject(rootDir, workflow);
  const savedWithArtifacts = persistUrlAnalysisArtifacts(rootDir, saved.summary.id, analyzed, saved.workflow) || saved;
  return {
    ...savedWithArtifacts,
    analysis: savedWithArtifacts.workflow.analysis,
    adapter: savedWithArtifacts.workflow.adapter,
    artifacts: savedWithArtifacts.workflow.artifacts,
    review: savedWithArtifacts.workflow.review,
  };
}

function createProject(rootDir, options = {}) {
  const starter = options.starter || {};
  if (starter.type === "blank") {
    return createStoredBlankProject(rootDir, options);
  }

  if (starter.type === "template") {
    return createStoredTemplateProject(rootDir, {
      ...options,
      templateId: starter.templateId,
    });
  }

  if (starter.type === "workflow-file") {
    return importWorkflowFile(rootDir, {
      ...options,
      filePath: starter.filePath,
    });
  }

  if (starter.type === "url") {
    return createStoredUrlProject(rootDir, {
      ...options,
      url: starter.url,
      html: starter.html,
      title: starter.title,
      preferPlaywright: starter.preferPlaywright,
    });
  }

  throw new Error("不支持的 starter.type。");
}

function importSource(rootDir, options = {}) {
  const imported = buildWorkflowFromImportedSource(options);
  const saved = saveProject(rootDir, imported.workflow);

  return {
    ...saved,
    analysis: imported.analysis,
  };
}

async function analyzeUrl(rootDir, options = {}) {
  return createStoredUrlProject(rootDir, options);
}

function loadStoredProject(rootDir, projectId) {
  return loadProject(rootDir, projectId);
}

function saveStoredProject(rootDir, projectId, workflow) {
  const normalized = normalizeWorkflow({
    ...clone(workflow),
    meta: {
      ...(workflow.meta || {}),
      id: projectId || (workflow.meta && workflow.meta.id),
    },
  });
  return saveProject(rootDir, normalized);
}

function previewExport(input, options = {}) {
  return previewWorkflowExport(input, {
    ...options,
    settings: buildSettingsSnapshot(options.settings || {}),
  });
}

function generateProject(rootDir, options = {}) {
  const generated = generateWorkflowProject(options.workflow, {
    outputDir: options.outputDir,
    settings: buildSettingsSnapshot(options.settings || loadSettings(rootDir)),
  });
  const saved = saveProject(rootDir, generated.workflow);

  return {
    ...generated,
    workflow: saved.workflow,
    summary: saved.summary,
  };
}

function getSettings(rootDir) {
  return loadSettings(rootDir);
}

function updateSettings(rootDir, settings) {
  return saveSettings(rootDir, settings);
}

function runWorkflow(rootDir, options = {}) {
  const callerOnRecordChange = typeof options.onRecordChange === "function" ? options.onRecordChange : null;
  return startRun(rootDir, {
    ...options,
    onRecordChange(record) {
      persistRunState(rootDir, options.projectId, record, options.workflow || null);
      if (callerOnRecordChange) {
        callerOnRecordChange(record);
      }
    },
  });
}

async function pauseWorkflow(rootDir, projectId, workflow) {
  const result = await pauseRun(rootDir, projectId);
  persistRunState(rootDir, projectId, result, workflow || null);
  return result;
}

async function resumeWorkflow(rootDir, projectId, workflow) {
  const result = await resumeRun(rootDir, projectId);
  persistRunState(rootDir, projectId, result, workflow || null);
  return result;
}

async function stopWorkflow(rootDir, projectId, workflow) {
  const result = await stopRun(rootDir, projectId);
  persistRunState(rootDir, projectId, result, workflow || null);
  return result;
}

function listRunHistory(rootDir, projectId) {
  return getRunHistory(rootDir, projectId);
}

function exportFile(input, filePath) {
  return exportWorkflowFile(input, filePath);
}

function getProjectSummary(input) {
  const workflow = normalizeWorkflow(input);
  workflow.diagnostics = workflow.diagnostics || computeWorkflowDiagnostics(workflow);
  return mapProjectSummary(workflow);
}

module.exports = {
  getCatalog,
  createPresetStep,
  detectImportSourceType,
  listProjects,
  createProject,
  analyzeUrl,
  importSource,
  loadStoredProject,
  saveStoredProject,
  previewExport,
  generateProject,
  getSettings,
  updateSettings,
  runWorkflow,
  pauseWorkflow,
  resumeWorkflow,
  stopWorkflow,
  listRunHistory,
  exportFile,
  loadWorkflowFile,
  getProjectSummary,
};
