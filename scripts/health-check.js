const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  loadImportCandidates,
  inferAccountSource,
  inferAccountFields,
  inferAuthStrategy,
  buildImportedAuth,
  buildImportedTaskGroups,
  finalizeImportedPlan,
} = require("../lib/importer");
const { createProject } = require("../lib/generator");
const desktopService = require("../lib/desktop-service");

const ROOT = path.resolve(__dirname, "..");

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

function runImportSmokeCase({ label, sourceType, fileName, expect }) {
  const inputPath = path.join(ROOT, "examples", fileName);
  const candidates = loadImportCandidates(sourceType, inputPath);
  assert(candidates.length > 0, `${label}: no candidates parsed`);

  const accountSource = inferAccountSource(candidates);
  const accountFields =
    accountSource === "accounts"
      ? inferAccountFields(candidates.find((candidate) => candidate.kind === "auth_login"))
      : [];
  const inferredAuthMode = inferAuthStrategy(candidates, accountSource);

  let authMode = inferredAuthMode;
  let nonceCandidate = null;
  let loginCandidate = null;

  if (authMode === "request") {
    loginCandidate = candidates.find((candidate) => candidate.kind === "auth_login") || null;
    if (!loginCandidate) {
      authMode = "none";
    }
  } else if (authMode === "evm_sign") {
    nonceCandidate = candidates.find((candidate) => candidate.kind === "auth_nonce") || null;
    loginCandidate = candidates.find((candidate) => candidate.kind === "auth_login") || null;
    if (!nonceCandidate || !loginCandidate) {
      authMode = "none";
    }
  }

  const auth = buildImportedAuth({
    authMode,
    loginCandidate,
    nonceCandidate,
    accountSource,
    accountFields,
  });
  const taskGroups = buildImportedTaskGroups({
    candidates,
    authMode,
    loginCandidate,
    nonceCandidate,
    accountSource,
    accountFields,
  });
  const finalized = finalizeImportedPlan({
    auth,
    taskGroups,
    loginCandidate,
    candidates,
  });

  const outputDir = path.join(ROOT, "generated", `health-${label}`);
  createProject({
    projectName: `health-${label}`,
    outputDir,
    accountSource,
    accountFields,
    useProxy: false,
    repeat: false,
    intervalMinutes: 0,
    concurrency: 2,
    auth: finalized.auth,
    authMode,
    selectedPresets: [],
    customTasks: finalized.taskGroups.map((group) => group.task),
    meta: {
      healthCheck: true,
      importSource: sourceType,
    },
  });

  const config = readJson(path.join(outputDir, "project.config.json"));
  runNodeCheck(path.join(outputDir, "lib", "runner.js"));

  if (expect.accountSource) {
    assert(
      config.accounts && config.accounts.source === expect.accountSource,
      `${label}: unexpected accountSource ${config.accounts && config.accounts.source}`
    );
  }

  if (expect.authType) {
    assert(config.auth && config.auth.type === expect.authType, `${label}: unexpected auth type`);
  }

  if (expect.mustContainTaskType) {
    const hasType = (config.tasks || []).some((task) => task.type === expect.mustContainTaskType);
    assert(hasType, `${label}: expected task type ${expect.mustContainTaskType}`);
  }

  if (expect.mustContainEnvKey) {
    const envText = fs.readFileSync(path.join(outputDir, ".env.example"), "utf8");
    assert(envText.includes(`${expect.mustContainEnvKey}=`), `${label}: missing env key ${expect.mustContainEnvKey}`);
  }

  if (expect.mustHaveSiwe) {
    assert(config.auth && config.auth.siwe, `${label}: missing auth.siwe`);
    assert(config.auth.messageTemplate, `${label}: missing messageTemplate`);
  }

  console.log(`[PASS] ${label}`);
}

function runPackageNameFallbackCheck() {
  const outputDir = path.join(ROOT, "generated", "health-package-name");
  createProject({
    projectName: "中文项目",
    outputDir,
    accountSource: "tokens",
    accountFields: [],
    useProxy: false,
    repeat: false,
    intervalMinutes: 0,
    concurrency: 1,
    auth: {
      type: "account_token",
      tokenField: "token",
    },
    authMode: "account_token",
    selectedPresets: [],
    customTasks: [
      {
        type: "request",
        name: "ping",
        method: "GET",
        url: "https://example.com/ping",
      },
    ],
  });

  const packageJson = readJson(path.join(outputDir, "package.json"));
  assert(packageJson.name === "generated-testnet-bot", "package name fallback failed");
  console.log("[PASS] package-name-fallback");
}

function main() {
  runNodeCheck(path.join(ROOT, "index.js"));
  runNodeCheck(path.join(ROOT, "lib", "importer.js"));
  runNodeCheck(path.join(ROOT, "lib", "generator.js"));
  runNodeCheck(path.join(ROOT, "lib", "presets.js"));
  runNodeCheck(path.join(ROOT, "lib", "desktop-service.js"));
  runNodeCheck(path.join(ROOT, "desktop", "main.js"));
  runNodeCheck(path.join(ROOT, "desktop", "preload.js"));
  runNodeCheck(path.join(ROOT, "desktop", "renderer", "app.js"));
  console.log("[PASS] syntax-check");

  runImportSmokeCase({
    label: "har",
    sourceType: "har",
    fileName: "sample.har",
    expect: {
      accountSource: "accounts",
      authType: "request",
      mustContainTaskType: "claimList",
    },
  });

  runImportSmokeCase({
    label: "postman",
    sourceType: "postman",
    fileName: "sample.postman_collection.json",
    expect: {
      accountSource: "accounts",
      authType: "request",
      mustContainTaskType: "claimList",
      mustContainEnvKey: "BASE_URL",
    },
  });

  runImportSmokeCase({
    label: "siwe",
    sourceType: "har",
    fileName: "sample-siwe.har",
    expect: {
      accountSource: "privateKeys",
      authType: "evm_sign",
      mustContainTaskType: "request",
      mustHaveSiwe: true,
    },
  });

  runImportSmokeCase({
    label: "curl",
    sourceType: "curl",
    fileName: "sample-curl.txt",
    expect: {
      accountSource: "tokens",
      authType: "account_token",
      mustContainTaskType: "request",
    },
  });

  runPackageNameFallbackCheck();
  const desktopPresets = desktopService.listPresets("privateKeys");
  assert(Array.isArray(desktopPresets) && desktopPresets.length > 0, "desktop presets unavailable");
  console.log("[PASS] desktop-service");
  console.log("health-check: all passed");
}

try {
  main();
} catch (error) {
  console.error(`health-check failed: ${error.message}`);
  process.exit(1);
}
