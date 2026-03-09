const fs = require("fs");
const path = require("path");
const { buildProjectConfig, createProject } = require("../generator");
const { clone, normalizeWorkflow, slugify } = require("./model");
const { computeWorkflowDiagnostics } = require("./diagnostics");

function buildDefaultOutputDir(workflow, requestedOutputDir) {
  if (requestedOutputDir && String(requestedOutputDir).trim()) {
    return path.resolve(String(requestedOutputDir).trim());
  }

  if (workflow.project && workflow.project.lastOutputDir) {
    return path.resolve(String(workflow.project.lastOutputDir));
  }

  const slug = slugify(
    workflow.project && workflow.project.name ? workflow.project.name : "workflow-studio"
  );
  return path.resolve(process.cwd(), "generated", slug || "workflow-studio");
}

function workflowToProjectOptions(input, options = {}) {
  const workflow = normalizeWorkflow(input);
  const diagnostics = computeWorkflowDiagnostics(workflow);
  workflow.diagnostics = diagnostics;

  const enabledSteps = workflow.steps.filter((step) => step.enabled !== false);
  const enabledTaskSteps = enabledSteps.filter((step) => step.type !== "auth");
  const auth = workflow.auth && workflow.auth.enabled && workflow.auth.mode !== "none"
    ? clone(workflow.auth.config)
    : null;
  const outputDir = buildDefaultOutputDir(workflow, options.outputDir);

  const projectOptions = {
    projectName: workflow.project.name,
    outputDir,
    accountSource: workflow.account.source,
    accountFields: workflow.account.fields || [],
    useProxy: Boolean(workflow.project.useProxy),
    repeat: Boolean(workflow.project.repeat),
    intervalMinutes: workflow.project.repeat
      ? Math.max(1, Number(workflow.project.intervalMinutes || 60))
      : 0,
    concurrency: Math.max(1, Number(workflow.project.concurrency || 1)),
    auth,
    authMode: workflow.auth && workflow.auth.mode ? workflow.auth.mode : "none",
    runtime: clone(workflow.runtime || {}),
    analysis: clone(workflow.analysis || {}),
    adapter: clone(workflow.adapter || {}),
    review: clone(workflow.review || {}),
    selectedPresets: [],
    customTasks: enabledTaskSteps.map((step) => clone(step.config)),
    meta: {
      workflowId: workflow.meta.id,
      workflowVersion: workflow.meta.workflowVersion,
      workflowSourceKind: workflow.meta.sourceKind,
      workflowStepCount: enabledTaskSteps.length,
      workflowSourceMaterial: workflow.meta.sourceMaterial || null,
    },
  };
  const projectConfig = buildProjectConfig(projectOptions);

  return {
    workflow,
    diagnostics,
    outputDir,
    projectOptions,
    projectConfig,
    canGenerate: diagnostics.summary.blockingCount === 0,
  };
}

function previewWorkflowExport(input, options = {}) {
  const prepared = workflowToProjectOptions(input, options);
  return {
    workflow: prepared.workflow,
    diagnostics: prepared.diagnostics,
    outputDir: prepared.outputDir,
    projectConfig: prepared.projectConfig,
    canGenerate: prepared.canGenerate,
  };
}

function buildBlockingMessage(diagnostics) {
  const blockers = (diagnostics.items || [])
    .filter((item) => item.level === "blocker")
    .slice(0, 6)
    .map((item, index) => `${index + 1}. ${item.message}`);

  return blockers.length > 0
    ? `当前流程还有阻塞项，不能生成：\n${blockers.join("\n")}`
    : "当前流程不能生成，请先修复诊断区里的阻塞项。";
}

function getWorkflowFileText(input) {
  const workflow = normalizeWorkflow(input);
  workflow.diagnostics = computeWorkflowDiagnostics(workflow);
  return `${JSON.stringify(workflow, null, 2)}\n`;
}

function exportWorkflowFile(input, filePath) {
  const targetPath = path.resolve(String(filePath || "").trim());
  if (!targetPath) {
    throw new Error("请提供导出路径。");
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, getWorkflowFileText(input), "utf8");
  return targetPath;
}

function loadWorkflowFile(filePath) {
  const targetPath = path.resolve(String(filePath || "").trim());
  const raw = fs.readFileSync(targetPath, "utf8");
  const parsed = JSON.parse(raw);
  return normalizeWorkflow(parsed);
}

function generateWorkflowProject(input, options = {}) {
  const prepared = workflowToProjectOptions(input, options);
  if (!prepared.canGenerate) {
    throw new Error(buildBlockingMessage(prepared.diagnostics));
  }

  const workflowForOutput = clone(prepared.workflow);
  workflowForOutput.project.lastOutputDir = prepared.outputDir;
  workflowForOutput.meta.updatedAt = new Date().toISOString();
  workflowForOutput.diagnostics = prepared.diagnostics;

  const result = createProject({
    ...prepared.projectOptions,
    outputDir: prepared.outputDir,
    extraFiles: {
      "workflow.fengflow.json": getWorkflowFileText(workflowForOutput),
    },
  });

  return {
    outputDir: result.outputDir,
    files: result.files,
    workflow: workflowForOutput,
    diagnostics: prepared.diagnostics,
    projectConfig: prepared.projectConfig,
  };
}

module.exports = {
  workflowToProjectOptions,
  previewWorkflowExport,
  generateWorkflowProject,
  getWorkflowFileText,
  exportWorkflowFile,
  loadWorkflowFile,
};
