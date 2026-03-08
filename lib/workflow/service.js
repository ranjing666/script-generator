const path = require("path");
const { buildWorkflowFromImportedSource, detectImportSourceType } = require("./import-source");
const { computeWorkflowDiagnostics } = require("./diagnostics");
const { exportWorkflowFile, generateWorkflowProject, loadWorkflowFile, previewWorkflowExport } = require("./exporter");
const { clone, createBlankWorkflow, getStepCatalog, normalizeWorkflow } = require("./model");
const { loadProject, listProjects, mapProjectSummary, saveProject } = require("./projects");
const { createWorkflowFromTemplate, listWorkflowTemplates } = require("./templates");

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

function getCatalog() {
  return {
    templates: listWorkflowTemplates(),
    stepCatalog: getStepCatalog(),
    accountSources: ACCOUNT_SOURCE_OPTIONS,
    authModes: AUTH_MODE_OPTIONS,
  };
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
  return previewWorkflowExport(input, options);
}

function generateProject(rootDir, options = {}) {
  const generated = generateWorkflowProject(options.workflow, {
    outputDir: options.outputDir,
  });
  const saved = saveProject(rootDir, generated.workflow);

  return {
    ...generated,
    workflow: saved.workflow,
    summary: saved.summary,
  };
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
  detectImportSourceType,
  listProjects,
  createProject,
  importSource,
  loadStoredProject,
  saveStoredProject,
  previewExport,
  generateProject,
  exportFile,
  loadWorkflowFile,
  getProjectSummary,
};
