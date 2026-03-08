const fs = require("fs");
const path = require("path");
const {
  loadImportCandidates,
  inferAccountSource,
  inferAccountFields,
  inferAuthStrategy,
  buildImportedAuth,
  buildImportedTaskGroups,
  finalizeImportedPlan,
} = require("../importer");
const {
  createAccountModel,
  createAuthModel,
  createBlankWorkflow,
  createWorkflowStep,
  normalizeWorkflow,
} = require("./model");

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

    if (parsed && parsed.meta && parsed.project && Array.isArray(parsed.steps)) {
      return {
        sourceType: "workflow",
        reason: "JSON 结构匹配 WorkflowDocument",
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

function buildImportConfidence({ sourceType, taskGroups, warnings, authMode, candidates }) {
  let score = 40;
  const notes = [];

  if (sourceType === "har") {
    score += 15;
    notes.push("HAR 通常保留的请求上下文最完整，自动识别率更高。");
  } else if (sourceType === "postman") {
    score += 8;
    notes.push("Postman 适合导入示例请求，但响应样本可能不完整。");
  } else if (sourceType === "curl") {
    score -= 6;
    notes.push("cURL 一般只有单次请求，不一定包含完整登录和列表链路。");
  }

  if ((taskGroups || []).length >= 3) {
    score += 15;
    notes.push("识别到多个任务组，说明抓包覆盖面比较完整。");
  } else if ((taskGroups || []).length > 0) {
    score += 8;
    notes.push("已经识别到可生成的任务组。");
  } else {
    score -= 18;
    notes.push("没有识别到稳定任务组，这类抓包通常需要大量手工补全。");
  }

  if (authMode && authMode !== "none") {
    score += 10;
    notes.push(`登录链路已识别为 ${authMode}。`);
  } else {
    score -= 10;
    notes.push("当前没有稳定登录链路，后面可能要手动补登录。");
  }

  if ((taskGroups || []).some((group) => group.task && group.task.type === "claimList")) {
    score += 8;
    notes.push("列表 + claim 已自动成组，后续手调成本更低。");
  }

  if ((candidates || []).length <= 2) {
    score -= 8;
    notes.push("抓包里的请求太少，可能没有覆盖完整流程。");
  }

  if ((warnings || []).length > 0) {
    score -= Math.min(20, warnings.length * 6);
    notes.push("导入阶段已经发现风险提示，建议生成前先检查诊断区。");
  }

  const boundedScore = Math.max(10, Math.min(95, score));
  const label = boundedScore >= 80 ? "高" : boundedScore >= 55 ? "中" : "低";

  return {
    score: boundedScore,
    label,
    notes,
  };
}

function buildWorkflowFromImportedSource(options = {}) {
  const detected = options.sourceType && options.sourceType !== "auto"
    ? {
        sourceType: options.sourceType,
        reason: "用户指定导入类型",
        inputPath: path.resolve(String(options.inputPath || "")),
      }
    : detectImportSourceType(options.inputPath);

  if (detected.sourceType === "workflow") {
    throw new Error("当前导入入口用于抓包材料，不接受 .fengflow.json。请走“导入流程文件”。");
  }

  const candidates = loadImportCandidates(detected.sourceType, detected.inputPath);
  if (candidates.length === 0) {
    throw new Error("没有从抓包文件中解析出可导入请求。");
  }

  const accountSource = options.accountSource || inferAccountSource(candidates);
  const inferredFields = inferAccountFields(candidates.find((candidate) => candidate.kind === "auth_login"));
  const accountFields = accountSource === "accounts"
    ? (Array.isArray(options.accountFields) && options.accountFields.length > 0
      ? options.accountFields
      : inferredFields)
    : [];
  const inferredAuthMode = inferAuthStrategy(candidates, accountSource);
  const authMode = options.authMode || inferredAuthMode;

  const loginCandidate = candidates.find((candidate) => candidate.kind === "auth_login") || null;
  const nonceCandidate = candidates.find((candidate) => candidate.kind === "auth_nonce") || null;
  const importedAuth = buildImportedAuth({
    authMode,
    loginCandidate,
    nonceCandidate,
    accountSource,
    accountFields,
  });
  const importedGroups = buildImportedTaskGroups({
    candidates,
    authMode,
    loginCandidate,
    nonceCandidate,
    accountSource,
    accountFields,
  });

  if (importedGroups.length === 0) {
    throw new Error("没有从抓包里构造出可导入任务组。");
  }

  const finalizedPlan = finalizeImportedPlan({
    auth: importedAuth,
    taskGroups: importedGroups,
    loginCandidate,
    candidates,
  });
  const warnings = [];
  if (authMode === "evm_sign" && (!loginCandidate || !nonceCandidate)) {
    warnings.push("签名登录链路不完整，建议检查 nonce/login 请求是否都在抓包里。");
  }
  if (authMode === "request" && !loginCandidate) {
    warnings.push("普通登录请求未识别成功，后续可能需要手工补登录。");
  }

  const confidence = buildImportConfidence({
    sourceType: detected.sourceType,
    taskGroups: finalizedPlan.taskGroups,
    warnings,
    authMode,
    candidates,
  });

  const projectName = String(
    options.projectName
    || path.basename(detected.inputPath, path.extname(detected.inputPath))
    || "imported-workflow"
  );
  const workflow = createBlankWorkflow({
    projectName,
    sourceKind: "import",
  });

  workflow.meta.sourceMaterial = {
    kind: "import",
    sourceType: detected.sourceType,
    inputPath: detected.inputPath,
    detectReason: detected.reason,
    candidateCount: candidates.length,
    taskGroupCount: finalizedPlan.taskGroups.length,
    warnings,
    confidence,
  };
  workflow.project = {
    ...workflow.project,
    name: projectName,
    concurrency: Math.max(1, Number(options.concurrency || 1)),
    useProxy: Boolean(options.useProxy),
    repeat: Boolean(options.repeat),
    intervalMinutes: Number(options.intervalMinutes || 60),
  };
  workflow.account = createAccountModel(accountSource, accountFields);
  workflow.auth = createAuthModel({
    accountSource,
    accountFields,
    mode: authMode,
    source: "import",
    config: finalizedPlan.auth,
  });
  workflow.steps = finalizedPlan.taskGroups.map((group) =>
    createWorkflowStep({
      type: group.task.type,
      title: group.label,
      source: "import",
      config: group.task,
      metadata: {
        sourceCandidateIds: group.sourceCandidateIds,
        sourceKinds: group.sourceKinds,
        recommendedOrder: group.recommendedOrder,
        summary: group.summary,
      },
    })
  );

  return {
    workflow: normalizeWorkflow(workflow),
    analysis: {
      sourceType: detected.sourceType,
      inputPath: detected.inputPath,
      detectReason: detected.reason,
      accountSource,
      accountFields,
      authMode,
      candidateCount: candidates.length,
      taskGroupCount: finalizedPlan.taskGroups.length,
      warnings,
      confidence,
    },
  };
}

module.exports = {
  detectImportSourceType,
  buildWorkflowFromImportedSource,
};
