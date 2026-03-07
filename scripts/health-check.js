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

function assertStarterFiles(outputDir, label) {
  const envExamplePath = path.join(outputDir, ".env.example");
  const envPath = path.join(outputDir, ".env");
  const starterGuidePath = path.join(outputDir, "00-先看这里-零基础说明.md");
  const installScriptPath = path.join(outputDir, "1-双击-安装依赖.bat");
  const startScriptPath = path.join(outputDir, "2-双击-启动脚本.bat");

  [envExamplePath, envPath, starterGuidePath, installScriptPath, startScriptPath].forEach((filePath) => {
    assert(fs.existsSync(filePath), `${label}: missing generated helper file ${path.basename(filePath)}`);
  });

  const envExampleText = fs.readFileSync(envExamplePath, "utf8");
  const envText = fs.readFileSync(envPath, "utf8");
  const starterGuideText = fs.readFileSync(starterGuidePath, "utf8");
  const installScriptText = fs.readFileSync(installScriptPath, "utf8");
  const startScriptText = fs.readFileSync(startScriptPath, "utf8");

  assert(envText === envExampleText, `${label}: .env should match .env.example on generation`);
  assert(starterGuideText.includes("1-双击-安装依赖.bat"), `${label}: starter guide missing install helper`);
  assert(installScriptText.includes("npm install"), `${label}: install helper missing npm install`);
  assert(startScriptText.includes("npm start"), `${label}: start helper missing npm start`);
  console.log(`[PASS] ${label}-starter-files`);
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
  const runnerSource = fs.readFileSync(path.join(outputDir, "lib", "runner.js"), "utf8");
  runNodeCheck(path.join(outputDir, "lib", "runner.js"));
  assertStarterFiles(outputDir, label);
  assert(
    runnerSource.includes("/^\\d+$/.test(tokenValue)"),
    `${label}: splitPath 数组下标正则转义异常`
  );

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
  assertStarterFiles(outputDir, "package-name-fallback");
  assert(packageJson.name === "generated-testnet-bot", "package name fallback failed");
  console.log("[PASS] package-name-fallback");
}

function expectThrows(fn, label, expectedText) {
  let thrown = false;
  try {
    fn();
  } catch (error) {
    thrown = true;
    const text = String(error && error.message ? error.message : error);
    assert(text.includes(expectedText), `${label}: unexpected error message -> ${text}`);
  }
  assert(thrown, `${label}: expected throw`);
  console.log(`[PASS] ${label}`);
}

function runInvalidImportChecks() {
  const invalidHarPath = path.join(ROOT, "generated", "health-invalid.har");
  fs.writeFileSync(invalidHarPath, "{ bad json", "utf8");
  expectThrows(
    () =>
      desktopService.analyzeImport({
        sourceType: "har",
        inputPath: invalidHarPath,
      }),
    "invalid-har-json",
    "HAR 文件不是有效 JSON"
  );

  const invalidPostmanPath = path.join(ROOT, "generated", "health-invalid-postman.json");
  fs.writeFileSync(invalidPostmanPath, JSON.stringify({ info: { name: "demo" } }, null, 2), "utf8");
  expectThrows(
    () =>
      desktopService.analyzeImport({
        sourceType: "postman",
        inputPath: invalidPostmanPath,
      }),
    "invalid-postman-structure",
    "缺少 item 列表"
  );
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
  runInvalidImportChecks();
  const desktopPresets = desktopService.listPresets("privateKeys");
  assert(Array.isArray(desktopPresets) && desktopPresets.length > 0, "desktop presets unavailable");
  const detectedHar = desktopService.detectImportSourceType(path.join(ROOT, "examples", "sample.har"));
  assert(detectedHar.sourceType === "har", "detectImportSourceType: har mismatch");
  const detectedCurl = desktopService.detectImportSourceType(path.join(ROOT, "examples", "sample-curl.txt"));
  assert(detectedCurl.sourceType === "curl", "detectImportSourceType: curl mismatch");
  console.log("[PASS] desktop-service");
  console.log("health-check: all passed");
}

try {
  main();
} catch (error) {
  console.error(`health-check failed: ${error.message}`);
  process.exit(1);
}
