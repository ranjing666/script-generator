const fs = require("fs");
const path = require("path");
const { getAvailablePresets, buildAuthConfig } = require("./presets");
const { createProject } = require("./generator");
const {
  loadImportCandidates,
  inferAccountSource,
  inferAccountFields,
  inferAuthStrategy,
  buildImportedAuth,
  buildImportedTaskGroups,
  finalizeImportedPlan,
} = require("./importer");

function toSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function sanitizeAccountFields(accountSource, accountFieldsInput, fallback = []) {
  if (accountSource !== "accounts") {
    return [];
  }

  const source = Array.isArray(accountFieldsInput)
    ? accountFieldsInput
    : String(accountFieldsInput || "")
        .split(",")
        .map((item) => item.trim());

  const unique = [...new Set(source.filter(Boolean))];
  return unique.length > 0 ? unique : fallback;
}

function buildOutputDir(outputDir, projectName, defaultOutputRoot) {
  if (outputDir && String(outputDir).trim()) {
    return path.resolve(String(outputDir).trim());
  }

  const slug = toSlug(projectName) || "generated-bot";
  const root = defaultOutputRoot && String(defaultOutputRoot).trim()
    ? path.resolve(String(defaultOutputRoot).trim())
    : path.join(process.cwd(), "generated");
  return path.join(root, slug);
}

function mapPresetSummary(preset) {
  return {
    id: preset.id,
    label: preset.label,
    summary: preset.summary,
    requiresPrivateKey: Boolean(preset.requiresPrivateKey),
  };
}

function mapCandidateSummary(candidate) {
  return {
    id: candidate.id,
    name: candidate.name,
    kind: candidate.kind,
    sourceType: candidate.sourceType,
    method: candidate.method,
    url: candidate.url,
    summary: candidate.summary,
    headers: candidate.headers || {},
    body: candidate.body,
    hasResponseBody: Boolean(candidate.responseBody && typeof candidate.responseBody === "object"),
  };
}

function mapGroupSummary(group) {
  return {
    id: group.id,
    label: group.label,
    summary: group.summary,
    recommendedOrder: group.recommendedOrder,
    sourceKinds: group.sourceKinds,
    sourceCandidateIds: group.sourceCandidateIds,
    taskType: group.task && group.task.type ? group.task.type : "unknown",
    taskName: group.task && group.task.name ? group.task.name : "unknown_task",
  };
}

function pickById(list, id) {
  if (!id) {
    return null;
  }
  return list.find((item) => item.id === id) || null;
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function detectImportSourceType(inputPath) {
  const rawPath = String(inputPath || "").trim();
  if (!rawPath) {
    throw new Error("请输入导入文件路径。");
  }

  const resolvedPath = path.resolve(rawPath);
  const extension = path.extname(resolvedPath).toLowerCase();

  if (extension === ".har") {
    return {
      sourceType: "har",
      reason: "文件扩展名为 .har",
      inputPath: resolvedPath,
    };
  }

  if (extension === ".txt" || extension === ".curl" || extension === ".sh") {
    return {
      sourceType: "curl",
      reason: "文件扩展名为 .txt/.curl/.sh",
      inputPath: resolvedPath,
    };
  }

  if (extension === ".json") {
    const parsed = safeParseJson(fs.readFileSync(resolvedPath, "utf8"));
    if (parsed && parsed.log && Array.isArray(parsed.log.entries)) {
      return {
        sourceType: "har",
        reason: "JSON 结构匹配 HAR（log.entries）",
        inputPath: resolvedPath,
      };
    }

    const schema = String(
      parsed && parsed.info && parsed.info.schema ? parsed.info.schema : ""
    ).toLowerCase();
    if (schema.includes("postman") || (parsed && Array.isArray(parsed.item))) {
      return {
        sourceType: "postman",
        reason: "JSON 结构匹配 Postman Collection",
        inputPath: resolvedPath,
      };
    }

    return {
      sourceType: "postman",
      reason: "文件扩展名为 .json，默认按 Postman 处理",
      inputPath: resolvedPath,
    };
  }

  return {
    sourceType: "har",
    reason: "无法识别格式，默认按 HAR 处理",
    inputPath: resolvedPath,
  };
}

function getAuthModeOptions(accountSource) {
  const options = [
    {
      id: "none",
      label: "none",
    },
    {
      id: "account_token",
      label: "account_token",
    },
  ];

  if (accountSource === "accounts") {
    options.push({
      id: "request",
      label: "request",
    });
  }

  if (accountSource === "privateKeys") {
    options.push({
      id: "request",
      label: "request",
    });
    options.push({
      id: "evm_sign",
      label: "evm_sign",
    });
  }

  return options;
}

function buildImportReport({
  importSource,
  inputPath,
  inferredAccountSource,
  inferredAuthMode,
  accountSource,
  authMode,
  authConfig,
  selectedTaskGroups,
  allCandidates,
}) {
  const candidateMap = new Map(allCandidates.map((candidate) => [candidate.id, candidate]));
  const selectedCandidateIds = new Set(
    selectedTaskGroups.flatMap((group) => group.sourceCandidateIds || [])
  );
  const warnings = [];

  if (authMode === "evm_sign") {
    if (!authConfig || authConfig.type !== "evm_sign") {
      warnings.push("签名登录模式已启用，但未生成 evm_sign 配置。");
    } else {
      if (!authConfig.noncePath) {
        warnings.push("未识别到 noncePath，建议手动检查 nonce/challenge 响应字段。");
      }
      if (!authConfig.messageTemplate && !authConfig.messagePath) {
        warnings.push("未识别到 messageTemplate/messagePath，签名消息可能无法自动构造。");
      }
      if (authConfig.messagePath === "data.message" && !authConfig.messageTemplate) {
        warnings.push("messagePath 仍是默认值 data.message，建议手动确认。");
      }
      if (authConfig.siwe) {
        if (!authConfig.siwe.domain || !authConfig.siwe.uri || !authConfig.siwe.chainId) {
          warnings.push("SIWE 上下文字段不完整（domain/uri/chainId），建议手动补齐。");
        }
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    importSource,
    importInputPath: path.resolve(inputPath),
    inferred: {
      accountSource: inferredAccountSource,
      authMode: inferredAuthMode,
    },
    selected: {
      accountSource,
      authMode,
      groupCount: selectedTaskGroups.length,
      groups: selectedTaskGroups.map((group) => ({
        id: group.id,
        label: group.label,
        summary: group.summary,
        recommendedOrder: group.recommendedOrder,
        sourceKinds: group.sourceKinds,
        sourceCandidateIds: group.sourceCandidateIds,
        taskType: group.task.type,
        taskName: group.task.name,
      })),
    },
    authSummary: authConfig
      ? {
          type: authConfig.type || authMode,
          hasNoncePath: Boolean(authConfig.noncePath),
          hasMessagePath: Boolean(authConfig.messagePath),
          hasMessageTemplate: Boolean(authConfig.messageTemplate),
          siwe: authConfig.siwe || null,
        }
      : null,
    warnings,
    candidates: [...selectedCandidateIds].map((candidateId) => {
      const candidate = candidateMap.get(candidateId);
      if (!candidate) {
        return { id: candidateId, missing: true };
      }

      return {
        id: candidate.id,
        sourceType: candidate.sourceType,
        kind: candidate.kind,
        name: candidate.name,
        summary: candidate.summary,
        method: candidate.method,
        url: candidate.url,
      };
    }),
  };
}

function listPresets(accountSource = "privateKeys") {
  return getAvailablePresets({ accountSource }).map(mapPresetSummary);
}

function getManualDefaults() {
  return {
    projectName: "my-testnet-bot",
    accountSource: "privateKeys",
    accountFields: [],
    useProxy: false,
    repeat: false,
    intervalMinutes: 60,
    concurrency: 3,
    authMode: "none",
    presetIds: ["api_checkin", "contract_call", "native_transfer"],
  };
}

function generateManualProject(options) {
  const projectName = String(options.projectName || "my-testnet-bot");
  const accountSource = options.accountSource || "privateKeys";
  const accountFields = sanitizeAccountFields(accountSource, options.accountFields, ["email", "password"]);
  const authMode = options.authMode || (accountSource === "tokens" ? "account_token" : "none");
  const useProxy = Boolean(options.useProxy);
  const repeat = Boolean(options.repeat);
  const intervalMinutes = repeat ? Number(options.intervalMinutes || 60) : 0;
  const concurrency = Math.max(1, Number(options.concurrency || 1));
  const outputDir = buildOutputDir(options.outputDir, projectName, options.defaultOutputRoot);

  const availablePresets = getAvailablePresets({ accountSource });
  const presetIds = new Set(Array.isArray(options.presetIds) ? options.presetIds : []);
  const selectedPresets = availablePresets.filter((preset) => presetIds.has(preset.id));

  if (selectedPresets.length === 0) {
    throw new Error("至少选择一个任务积木。");
  }

  const auth = buildAuthConfig({
    authMode,
    accountSource,
    accountFields,
  });

  const result = createProject({
    projectName,
    outputDir,
    accountSource,
    accountFields,
    useProxy,
    repeat,
    intervalMinutes,
    concurrency,
    auth,
    authMode,
    selectedPresets,
  });

  return {
    mode: "manual",
    outputDir: result.outputDir,
    files: result.files,
    presetIds: selectedPresets.map((preset) => preset.id),
  };
}

function analyzeImport(options) {
  const sourceType = options.sourceType || "har";
  const inputPath = String(options.inputPath || "").trim();
  if (!inputPath) {
    throw new Error("请输入导入文件路径。");
  }

  const candidates = loadImportCandidates(sourceType, inputPath);
  if (candidates.length === 0) {
    throw new Error("没有从抓包文件中解析出可导入请求。");
  }

  const inferredAccountSource = inferAccountSource(candidates);
  const accountSource = options.accountSource || inferredAccountSource;
  const inferredAuthMode = inferAuthStrategy(candidates, accountSource);
  const requestedAuthMode = options.authMode || inferredAuthMode;
  const warnings = [];

  const loginCandidates = candidates.filter((candidate) => candidate.kind === "auth_login");
  const nonceCandidates = candidates.filter((candidate) => candidate.kind === "auth_nonce");
  const defaultLoginCandidate = loginCandidates[0] || null;
  const defaultNonceCandidate = nonceCandidates[0] || null;

  const loginCandidate = pickById(loginCandidates, options.loginCandidateId) || defaultLoginCandidate;
  const nonceCandidate = pickById(nonceCandidates, options.nonceCandidateId) || defaultNonceCandidate;
  let authMode = requestedAuthMode;
  if (authMode === "request" && !loginCandidate) {
    authMode = accountSource === "tokens" ? "account_token" : "none";
    warnings.push("未找到登录请求，已自动回退登录模式。");
  }
  if (authMode === "evm_sign" && (!loginCandidate || !nonceCandidate)) {
    authMode = accountSource === "tokens" ? "account_token" : "none";
    warnings.push("签名登录缺少 nonce 或 login 请求，已自动回退登录模式。");
  }

  const guessedAccountFields = inferAccountFields(loginCandidate);
  const accountFields = sanitizeAccountFields(
    accountSource,
    options.accountFields,
    guessedAccountFields
  );

  const authModeOptions = getAuthModeOptions(accountSource);
  const taskGroups = buildImportedTaskGroups({
    candidates,
    authMode,
    loginCandidate,
    nonceCandidate,
    accountSource,
    accountFields,
  });

  return {
    sourceType,
    inputPath: path.resolve(inputPath),
    inferredAccountSource,
    accountSource,
    inferredAuthMode,
    authMode,
    authModeOptions,
    guessedAccountFields,
    accountFields,
    candidates: candidates.map(mapCandidateSummary),
    loginCandidates: loginCandidates.map(mapCandidateSummary),
    nonceCandidates: nonceCandidates.map(mapCandidateSummary),
    defaultLoginCandidateId: defaultLoginCandidate ? defaultLoginCandidate.id : null,
    defaultNonceCandidateId: defaultNonceCandidate ? defaultNonceCandidate.id : null,
    groups: taskGroups.map(mapGroupSummary),
    warnings,
  };
}

function generateImportProject(options) {
  const analysis = analyzeImport(options);
  const candidates = loadImportCandidates(analysis.sourceType, analysis.inputPath);
  const candidateMap = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  const loginCandidate = analysis.defaultLoginCandidateId
    ? candidateMap.get(options.loginCandidateId || analysis.defaultLoginCandidateId) || null
    : null;
  const nonceCandidate = analysis.defaultNonceCandidateId
    ? candidateMap.get(options.nonceCandidateId || analysis.defaultNonceCandidateId) || null
    : null;

  const accountSource = analysis.accountSource;
  const accountFields = analysis.accountFields;
  const authMode = analysis.authMode;

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

  let selectedTaskGroups = taskGroups;
  if (Array.isArray(options.selectedGroupIds) && options.selectedGroupIds.length > 0) {
    const selectedSet = new Set(options.selectedGroupIds);
    const matchedGroups = taskGroups.filter((group) => selectedSet.has(group.id));
    if (matchedGroups.length > 0) {
      selectedTaskGroups = matchedGroups;
    }
  }

  if (selectedTaskGroups.length === 0) {
    throw new Error("至少选择一个任务组。");
  }

  const finalizedPlan = finalizeImportedPlan({
    auth,
    taskGroups: selectedTaskGroups,
    loginCandidate,
    candidates,
  });

  const projectName = String(options.projectName || "imported-testnet-bot");
  const outputDir = buildOutputDir(options.outputDir, projectName, options.defaultOutputRoot);
  const useProxy = Boolean(options.useProxy);
  const repeat = Boolean(options.repeat);
  const intervalMinutes = repeat ? Number(options.intervalMinutes || 60) : 0;
  const concurrency = Math.max(1, Number(options.concurrency || 1));

  const recommendedTaskOrder = finalizedPlan.taskGroups.map((group) => ({
    order: group.recommendedOrder,
    label: group.label,
    sourceKinds: group.sourceKinds,
  }));

  const importReport = buildImportReport({
    importSource: analysis.sourceType,
    inputPath: analysis.inputPath,
    inferredAccountSource: analysis.inferredAccountSource,
    inferredAuthMode: analysis.inferredAuthMode,
    accountSource,
    authMode,
    authConfig: finalizedPlan.auth,
    selectedTaskGroups: finalizedPlan.taskGroups,
    allCandidates: candidates,
  });

  const result = createProject({
    projectName,
    outputDir,
    accountSource,
    accountFields,
    useProxy,
    repeat,
    intervalMinutes,
    concurrency,
    auth: finalizedPlan.auth,
    authMode,
    selectedPresets: [],
    customTasks: finalizedPlan.taskGroups.map((group) => group.task),
    meta: {
      importSource: analysis.sourceType,
      importedRequestCount: finalizedPlan.taskGroups.reduce(
        (total, group) => total + group.sourceCandidateIds.length,
        0
      ),
      importedGroupCount: finalizedPlan.taskGroups.length,
      importedAuthMode: authMode,
      recommendedTaskOrder,
    },
    extraFiles: {
      "import.report.json": `${JSON.stringify(importReport, null, 2)}\n`,
    },
  });

  return {
    mode: "import",
    outputDir: result.outputDir,
    files: result.files,
    report: importReport,
  };
}

module.exports = {
  listPresets,
  getManualDefaults,
  detectImportSourceType,
  analyzeImport,
  generateManualProject,
  generateImportProject,
};
