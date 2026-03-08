const fs = require("fs");
const path = require("path");
const { computeWorkflowDiagnostics } = require("./diagnostics");
const { clone, normalizeWorkflow, nowIso } = require("./model");

function ensureLibraryRoot(rootDir) {
  const target = path.resolve(String(rootDir || ""));
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function getProjectDir(rootDir, projectId) {
  return path.join(ensureLibraryRoot(rootDir), projectId);
}

function getWorkflowPath(rootDir, projectId) {
  return path.join(getProjectDir(rootDir, projectId), "workflow.json");
}

function mapProjectSummary(workflow) {
  const diagnostics = workflow.diagnostics || computeWorkflowDiagnostics(workflow);
  return {
    id: workflow.meta.id,
    name: workflow.project.name,
    createdAt: workflow.meta.createdAt,
    updatedAt: workflow.meta.updatedAt,
    sourceKind: workflow.meta.sourceKind,
    workflowVersion: workflow.meta.workflowVersion,
    lastOutputDir: workflow.project.lastOutputDir || "",
    stepCount: (workflow.steps || []).filter((step) => step.type !== "auth").length,
    blockingCount: diagnostics.summary.blockingCount,
    warningCount: diagnostics.summary.warningCount,
  };
}

function saveProject(rootDir, input) {
  const workflow = normalizeWorkflow(input);
  const timestamp = nowIso();

  workflow.meta.updatedAt = timestamp;
  workflow.meta.createdAt = workflow.meta.createdAt || timestamp;
  workflow.diagnostics = computeWorkflowDiagnostics(workflow);

  const targetPath = getWorkflowPath(rootDir, workflow.meta.id);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");

  return {
    workflow: clone(workflow),
    summary: mapProjectSummary(workflow),
  };
}

function loadProject(rootDir, projectId) {
  const targetPath = getWorkflowPath(rootDir, projectId);
  if (!fs.existsSync(targetPath)) {
    throw new Error(`找不到项目: ${projectId}`);
  }

  const workflow = normalizeWorkflow(JSON.parse(fs.readFileSync(targetPath, "utf8")));
  workflow.diagnostics = computeWorkflowDiagnostics(workflow);
  return {
    workflow,
    summary: mapProjectSummary(workflow),
  };
}

function listProjects(rootDir) {
  const targetRoot = ensureLibraryRoot(rootDir);
  const entries = fs.readdirSync(targetRoot, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const targetPath = getWorkflowPath(targetRoot, entry.name);
      if (!fs.existsSync(targetPath)) {
        return null;
      }

      try {
        const workflow = normalizeWorkflow(JSON.parse(fs.readFileSync(targetPath, "utf8")));
        workflow.diagnostics = computeWorkflowDiagnostics(workflow);
        return mapProjectSummary(workflow);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

module.exports = {
  ensureLibraryRoot,
  saveProject,
  loadProject,
  listProjects,
  mapProjectSummary,
};
