const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const workflow = require("../lib/workflow");
const workflowService = require("../lib/workflow/service");

const ROOT = path.resolve(__dirname, "..");
const HEALTH_ROOT = path.join(ROOT, "generated", "health-v2");

function runNodeCheck(filePath) {
  execFileSync(process.execPath, ["-c", filePath], {
    cwd: ROOT,
    stdio: "pipe",
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resetDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function assertStarterFiles(outputDir, label) {
  [
    "project.config.json",
    "runtime.config.json",
    "doctor.js",
    "main.js",
    "lib/runner.js",
    "workflow.fengflow.json",
    "0-双击-运行前检查.bat",
    "1-双击-安装依赖.bat",
    "2-双击-启动脚本.bat",
  ].forEach((fileName) => {
    const targetPath = path.join(outputDir, fileName);
    assert(fs.existsSync(targetPath), `${label}: missing ${fileName}`);
  });

  runNodeCheck(path.join(outputDir, "doctor.js"));
  runNodeCheck(path.join(outputDir, "lib", "runner.js"));
  const exportedWorkflow = readJson(path.join(outputDir, "workflow.fengflow.json"));
  assert(exportedWorkflow.meta && exportedWorkflow.project, `${label}: invalid workflow.fengflow.json`);
  console.log(`[PASS] ${label}-starter-files`);
}

function assertGeneratedProject(outputDir, label) {
  const config = readJson(path.join(outputDir, "project.config.json"));
  assert(config.project && config.accounts, `${label}: project.config.json missing project/accounts`);
  assert(Array.isArray(config.tasks), `${label}: project.config.json missing tasks array`);
  assertStarterFiles(outputDir, label);
  console.log(`[PASS] ${label}-generated-project`);
}

function runSyntaxChecks() {
  [
    "index.js",
    "lib/generator.js",
    "lib/importer.js",
    "lib/presets.js",
    "lib/desktop-service.js",
    "lib/workflow/model.js",
    "lib/workflow/templates.js",
    "lib/workflow/diagnostics.js",
    "lib/workflow/import-source.js",
    "lib/workflow/exporter.js",
    "lib/workflow/projects.js",
    "lib/workflow/service.js",
    "lib/workflow/adapters.js",
    "lib/workflow/url-analysis.js",
    "lib/workflow/settings.js",
    "lib/workflow/runtime.js",
    "desktop/main.js",
    "desktop/preload.js",
    "desktop/renderer/app.js",
  ].forEach((relativePath) => {
    runNodeCheck(path.join(ROOT, relativePath));
  });
  console.log("[PASS] syntax-check");
}

function runCatalogCheck() {
  const catalog = workflowService.getCatalog();
  assert(Array.isArray(catalog.templates) && catalog.templates.length > 0, "catalog: missing templates");
  assert(Array.isArray(catalog.stepCatalog) && catalog.stepCatalog.length > 0, "catalog: missing step catalog");
  assert(Array.isArray(catalog.taskPresets) && catalog.taskPresets.length > 0, "catalog: missing task presets");
  assert(Array.isArray(catalog.adapters) && catalog.adapters.length > 0, "catalog: missing adapters");
  console.log("[PASS] workflow-catalog");
}

function runWorkflowV2Check() {
  const workflowDoc = workflow.createBlankWorkflow({ projectName: "v2-check" });
  assert(workflowDoc.meta.workflowVersion === 2, "workflow-v2: version mismatch");
  assert(workflowDoc.analysis && workflowDoc.runtime && workflowDoc.review && workflowDoc.artifacts && workflowDoc.adapter, "workflow-v2: missing top-level sections");

  const normalized = workflow.normalizeWorkflow({
    meta: { name: "legacy" },
    project: { name: "legacy" },
    account: { source: "accounts", fields: ["email", "password"] },
    auth: { mode: "none" },
    steps: [
      {
        id: "legacy_wait",
        type: "wait",
        title: "Wait",
        enabled: true,
        source: "manual",
        config: { type: "wait", name: "wait_step", delayMs: 1000 },
      },
    ],
  });
  assert(normalized.meta.workflowVersion === 2, "workflow-v2: normalize should upgrade version");
  console.log("[PASS] workflow-v2");
}

function runPresetStepCheck() {
  const accountPreset = workflowService.createPresetStep({
    presetId: "api_batch_submit",
    accountSource: "accounts",
    accountFields: ["email", "password"],
    authMode: "request",
  });
  assert(accountPreset.type === "requestFromFile", "preset-step: requestFromFile mismatch");
  assert(accountPreset.metadata && accountPreset.metadata.presetId === "api_batch_submit", "preset-step: metadata mismatch");

  const privateKeyPreset = workflowService.createPresetStep({
    presetId: "contract_call",
    accountSource: "privateKeys",
    accountFields: [],
    authMode: "evm_sign",
  });
  assert(privateKeyPreset.type === "contractWrite", "preset-step: contractWrite mismatch");
  console.log("[PASS] workflow-preset-step");
}

function runProjectLibraryCheck() {
  const libraryRoot = path.join(HEALTH_ROOT, "library");
  resetDir(libraryRoot);

  const created = workflowService.createProject(libraryRoot, {
    starter: { type: "blank" },
    projectName: "blank-health",
  });
  assert(created.summary.sourceKind === "blank", "library: blank project sourceKind mismatch");

  created.workflow.project.name = "blank-health-renamed";
  created.workflow.account.source = "accounts";
  created.workflow.account.fields = ["email", "password"];
  created.workflow.auth.mode = "request";
  created.workflow.auth.enabled = true;
  created.workflow.auth.config = {
    type: "request",
    request: {
      method: "POST",
      url: "https://example.com/api/login",
      headers: { "Content-Type": "application/json" },
      body: { email: "{{account.email}}", password: "{{account.password}}" },
    },
    extractTokenPath: "data.token",
  };
  created.workflow.steps.push({
    id: "step_ping",
    type: "request",
    title: "Ping",
    enabled: true,
    source: "manual",
    notes: [],
    metadata: {},
    config: {
      type: "request",
      name: "ping",
      method: "GET",
      url: "https://example.com/ping",
      headers: {},
    },
  });

  const saved = workflowService.saveStoredProject(
    libraryRoot,
    created.summary.id,
    created.workflow
  );
  const loaded = workflowService.loadStoredProject(libraryRoot, created.summary.id);
  const listed = workflowService.listProjects(libraryRoot);

  assert(saved.summary.name === "blank-health-renamed", "library: save summary name mismatch");
  assert(loaded.workflow.project.name === "blank-health-renamed", "library: load name mismatch");
  assert(Array.isArray(listed) && listed.length === 1, "library: list mismatch");
  console.log("[PASS] workflow-library");
}

async function runUrlAnalysisCheck() {
  const libraryRoot = path.join(HEALTH_ROOT, "url-library");
  resetDir(libraryRoot);
  const html = fs.readFileSync(path.join(ROOT, "examples", "sample-url.html"), "utf8");
  const analyzed = await workflowService.analyzeUrl(libraryRoot, {
    url: "https://quests.example.com/faucet",
    html,
    title: "Quest Faucet Portal",
    projectName: "url-workflow",
  });

  assert(analyzed.summary.sourceKind === "url", "url-analysis: sourceKind mismatch");
  assert(analyzed.workflow.analysis && analyzed.workflow.analysis.sourceType === "url", "url-analysis: missing analysis");
  assert(analyzed.workflow.adapter && analyzed.workflow.adapter.id, "url-analysis: missing adapter");
  assert(
    analyzed.workflow.steps.some((step) => ["browserAction", "walletConnect", "captchaSolve", "request"].includes(step.type)),
    "url-analysis: expected new step types"
  );
  console.log("[PASS] url-analysis");
}

function runSettingsCheck() {
  const libraryRoot = path.join(HEALTH_ROOT, "settings-library");
  resetDir(libraryRoot);
  const saved = workflowService.updateSettings(libraryRoot, {
    ai: {
      provider: "openai",
      endpoint: "https://api.example.com/v1",
      model: "gpt-4.1-mini",
      apiKey: "secret",
    },
    wallet: {
      mode: "hybrid",
    },
  });
  const loaded = workflowService.getSettings(libraryRoot);
  assert(saved.ai.provider === "openai", "settings: save mismatch");
  assert(loaded.ai.provider === "openai", "settings: load mismatch");
  console.log("[PASS] settings");
}

async function runRuntimeCheck() {
  const libraryRoot = path.join(HEALTH_ROOT, "runtime-library");
  const outputDir = path.join(HEALTH_ROOT, "runtime-output");
  resetDir(libraryRoot);
  resetDir(outputDir);

  fs.writeFileSync(
    path.join(outputDir, "main.js"),
    'console.log("hello runtime"); setTimeout(() => { console.log("runtime done"); process.exit(0); }, 200);',
    "utf8"
  );

  const created = workflowService.createProject(libraryRoot, {
    starter: { type: "blank" },
    projectName: "runtime-workflow",
  });
  created.workflow.project.lastOutputDir = outputDir;
  const saved = workflowService.saveStoredProject(libraryRoot, created.summary.id, created.workflow);
  const started = workflowService.runWorkflow(libraryRoot, {
    projectId: saved.summary.id,
    workflow: saved.workflow,
    outputDir,
  });
  assert(started.status === "running", "runtime: start mismatch");

  await new Promise((resolve) => setTimeout(resolve, 500));
  const history = workflowService.listRunHistory(libraryRoot, saved.summary.id);
  assert(Array.isArray(history) && history.length > 0, "runtime: history missing");
  assert(["completed", "running"].includes(history[0].status), "runtime: unexpected status");
  console.log("[PASS] runtime-history");
}

function runTemplateFlowCheck() {
  const libraryRoot = path.join(HEALTH_ROOT, "template-library");
  const outputDir = path.join(HEALTH_ROOT, "template-output");
  resetDir(libraryRoot);
  resetDir(outputDir);

  const created = workflowService.createProject(libraryRoot, {
    starter: { type: "template", templateId: "easy_batch_submit" },
  });
  const preview = workflowService.previewExport(created.workflow, { outputDir });
  assert(preview.canGenerate, "template: preview should be generatable");
  assert(
    preview.projectConfig.tasks.some((task) => task.type === "requestFromFile"),
    "template: missing requestFromFile task"
  );

  const generated = workflowService.generateProject(libraryRoot, {
    projectId: created.summary.id,
    workflow: created.workflow,
    outputDir,
  });
  assertGeneratedProject(generated.outputDir, "template");
  console.log("[PASS] template-flow");
}

function runImportFlowCheck(label, sourceType, fileName, expectation) {
  const libraryRoot = path.join(HEALTH_ROOT, `${label}-library`);
  const outputDir = path.join(HEALTH_ROOT, `${label}-output`);
  resetDir(libraryRoot);
  resetDir(outputDir);

  const imported = workflowService.importSource(libraryRoot, {
    sourceType,
    inputPath: path.join(ROOT, "examples", fileName),
    projectName: `${label}-workflow`,
    concurrency: 1,
    repeat: false,
    intervalMinutes: 60,
    useProxy: false,
  });
  assert(imported.summary.sourceKind === "import", `${label}: sourceKind mismatch`);
  const preview = workflowService.previewExport(imported.workflow, { outputDir });
  assert(preview.canGenerate, `${label}: preview should be generatable`);

  if (expectation.authMode) {
    assert(imported.workflow.auth.mode === expectation.authMode, `${label}: authMode mismatch`);
  }

  if (expectation.mustHaveTaskType) {
    assert(
      imported.workflow.steps.some((step) => step.type === expectation.mustHaveTaskType),
      `${label}: missing step type ${expectation.mustHaveTaskType}`
    );
  }

  const generated = workflowService.generateProject(libraryRoot, {
    projectId: imported.summary.id,
    workflow: imported.workflow,
    outputDir,
  });
  assertGeneratedProject(generated.outputDir, label);
  console.log(`[PASS] ${label}-flow`);
}

function runWorkflowFileRoundTripCheck() {
  const libraryRoot = path.join(HEALTH_ROOT, "workflow-file-library");
  const exportDir = path.join(HEALTH_ROOT, "workflow-file-export");
  resetDir(libraryRoot);
  resetDir(exportDir);

  const workflowDoc = workflow.createWorkflowFromTemplate("easy_api_accounts");
  const filePath = path.join(exportDir, "sample.fengflow.json");
  workflow.exportWorkflowFile(workflowDoc, filePath);
  assert(fs.existsSync(filePath), "workflow-file: export file missing");

  const imported = workflowService.createProject(libraryRoot, {
    starter: { type: "workflow-file", filePath },
  });
  assert(imported.workflow.meta.sourceMaterial.kind === "workflow-file", "workflow-file: sourceMaterial mismatch");
  console.log("[PASS] workflow-file-roundtrip");
}

function runCliExportCheck() {
  const cliRoot = path.join(HEALTH_ROOT, "cli");
  const flowPath = path.join(cliRoot, "cli-sample.fengflow.json");
  const outputDir = path.join(cliRoot, "output");
  resetDir(cliRoot);
  resetDir(outputDir);

  const workflowDoc = workflow.createWorkflowFromTemplate("easy_api_accounts");
  workflow.exportWorkflowFile(workflowDoc, flowPath);
  execFileSync(
    process.execPath,
    ["index.js", "export", "--workflow", flowPath, "--output", outputDir],
    {
      cwd: ROOT,
      stdio: "pipe",
    }
  );
  assertGeneratedProject(outputDir, "cli-export");
  console.log("[PASS] cli-export");
}

function runDetectorCheck() {
  const har = workflowService.detectImportSourceType(path.join(ROOT, "examples", "sample.har"));
  const postman = workflowService.detectImportSourceType(path.join(ROOT, "examples", "sample.postman_collection.json"));
  const curl = workflowService.detectImportSourceType(path.join(ROOT, "examples", "sample-curl.txt"));

  assert(har.sourceType === "har", "detector: har mismatch");
  assert(postman.sourceType === "postman", "detector: postman mismatch");
  assert(curl.sourceType === "curl", "detector: curl mismatch");
  console.log("[PASS] import-detector");
}

async function main() {
  resetDir(HEALTH_ROOT);
  runSyntaxChecks();
  runCatalogCheck();
  runWorkflowV2Check();
  runPresetStepCheck();
  runProjectLibraryCheck();
  await runUrlAnalysisCheck();
  runSettingsCheck();
  runTemplateFlowCheck();
  runImportFlowCheck("har", "har", "sample.har", {
    authMode: "request",
    mustHaveTaskType: "claimList",
  });
  runImportFlowCheck("postman", "postman", "sample.postman_collection.json", {
    authMode: "request",
    mustHaveTaskType: "claimList",
  });
  runImportFlowCheck("siwe", "har", "sample-siwe.har", {
    authMode: "evm_sign",
    mustHaveTaskType: "request",
  });
  runImportFlowCheck("curl", "curl", "sample-curl.txt", {
    authMode: "account_token",
    mustHaveTaskType: "request",
  });
  runWorkflowFileRoundTripCheck();
  runCliExportCheck();
  runDetectorCheck();
  await runRuntimeCheck();
  console.log("health-check: all passed");
}

try {
  Promise.resolve(main()).catch((error) => {
    console.error(`health-check failed: ${error.message}`);
    process.exit(1);
  });
} catch (error) {
  console.error(`health-check failed: ${error.message}`);
  process.exit(1);
}
