const { clone, normalizeWorkflow } = require("./model");

function addIssue(items, level, code, message, target) {
  items.push({
    level,
    code,
    message,
    target: target || null,
  });
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateRequestShape(items, request, prefix, level = "blocker") {
  if (!request || typeof request !== "object") {
    addIssue(items, level, `${prefix}.missing`, `${prefix} 缺少请求配置。`, prefix);
    return;
  }

  if (!hasText(request.method)) {
    addIssue(items, level, `${prefix}.method`, `${prefix} 缺少 method。`, prefix);
  }

  if (!hasText(request.url)) {
    addIssue(items, level, `${prefix}.url`, `${prefix} 缺少 URL。`, prefix);
  }
}

function validateAuth(items, workflow) {
  const auth = workflow.auth || {};
  if (!auth.enabled || auth.mode === "none") {
    return;
  }

  if (!auth.config || typeof auth.config !== "object") {
    addIssue(items, "blocker", "auth.config", "登录已启用，但缺少登录配置。", "auth");
    return;
  }

  if (auth.mode === "account_token") {
    if (!hasText(auth.config.tokenField || "token")) {
      addIssue(items, "warning", "auth.tokenField", "Token 登录没有明确 tokenField，将默认使用 token。", "auth");
    }
    return;
  }

  if (auth.mode === "request") {
    validateRequestShape(items, auth.config.request, "auth.request");
    if (!hasText(auth.config.extractTokenPath)) {
      addIssue(items, "warning", "auth.extractTokenPath", "普通登录没有 token 提取路径，生成后很可能拿不到 token。", "auth");
    }
    return;
  }

  if (auth.mode === "evm_sign") {
    if (workflow.account.source !== "privateKeys") {
      addIssue(items, "blocker", "auth.accountSource", "钱包签名登录只能和私钥账号源一起使用。", "auth");
    }

    validateRequestShape(items, auth.config.nonceRequest, "auth.nonceRequest");
    validateRequestShape(items, auth.config.loginRequest, "auth.loginRequest");
    if (!hasText(auth.config.noncePath)) {
      addIssue(items, "warning", "auth.noncePath", "签名登录没有 noncePath，建议确认 challenge/nonce 字段路径。", "auth");
    }
    if (!hasText(auth.config.messagePath) && !hasText(auth.config.messageTemplate)) {
      addIssue(items, "warning", "auth.message", "签名登录既没有 messagePath 也没有 messageTemplate。", "auth");
    }
    if (!hasText(auth.config.extractTokenPath)) {
      addIssue(items, "warning", "auth.extractTokenPath", "签名登录没有 token 提取路径，登录成功后可能拿不到 token。", "auth");
    }
  }
}

function validateStep(items, step) {
  const config = step && step.config ? step.config : {};
  const target = `steps.${step.id}`;

  if (!step.enabled || step.type === "auth") {
    return;
  }

  if (!hasText(step.title)) {
    addIssue(items, "warning", `${target}.title`, "有步骤没有标题，后续排查会不方便。", target);
  }

  if (step.type === "request") {
    validateRequestShape(items, config, `${target}.request`);
    return;
  }

  if (step.type === "requestFromFile") {
    if (!hasText(config.dataFile)) {
      addIssue(items, "blocker", `${target}.dataFile`, "批量提交步骤缺少 dataFile。", target);
    }
    if (!Array.isArray(config.fields) || config.fields.length === 0) {
      addIssue(items, "blocker", `${target}.fields`, "批量提交步骤至少要有一个字段名。", target);
    }
    validateRequestShape(items, config.request, `${target}.request`);
    return;
  }

  if (step.type === "claimList") {
    validateRequestShape(items, config.listRequest, `${target}.listRequest`);
    validateRequestShape(items, config.claimRequest, `${target}.claimRequest`);
    if (!hasText(config.itemsPath)) {
      addIssue(items, "blocker", `${target}.itemsPath`, "列表领取步骤缺少 itemsPath。", target);
    }
    return;
  }

  if (step.type === "contractWrite") {
    if (!hasText(config.contractAddress)) {
      addIssue(items, "blocker", `${target}.contractAddress`, "链上写入步骤缺少合约地址。", target);
    }
    if (!Array.isArray(config.abi) || config.abi.length === 0) {
      addIssue(items, "blocker", `${target}.abi`, "链上写入步骤缺少 ABI。", target);
    }
    if (!hasText(config.method)) {
      addIssue(items, "blocker", `${target}.method`, "链上写入步骤缺少方法名。", target);
    }
    return;
  }

  if (step.type === "nativeTransfer") {
    if (!hasText(config.to)) {
      addIssue(items, "blocker", `${target}.to`, "原生币转账步骤缺少接收地址。", target);
    }
    if (!hasText(config.amount)) {
      addIssue(items, "blocker", `${target}.amount`, "原生币转账步骤缺少数量。", target);
    }
    return;
  }

  if (step.type === "deployContract") {
    if (!hasText(config.contractName)) {
      addIssue(items, "blocker", `${target}.contractName`, "部署步骤缺少合约名。", target);
    }
    if (!hasText(config.sourceCode)) {
      addIssue(items, "blocker", `${target}.sourceCode`, "部署步骤缺少源码。", target);
    }
    return;
  }

  if (step.type === "wait" && Number(config.delayMs || 0) <= 0) {
    addIssue(items, "warning", `${target}.delayMs`, "等待步骤的 delayMs 不大于 0，等于没等待。", target);
  }
}

function computeWorkflowDiagnostics(input) {
  const workflow = normalizeWorkflow(input);
  const items = [];
  const enabledTaskSteps = workflow.steps.filter((step) => step.type !== "auth" && step.enabled);

  if (!hasText(workflow.project.name)) {
    addIssue(items, "blocker", "project.name", "项目名为空。", "project");
  }

  if (!workflow.account || !workflow.account.source) {
    addIssue(items, "blocker", "account.source", "没有账号来源。", "account");
  }

  if (workflow.account.source === "accounts" && (!Array.isArray(workflow.account.fields) || workflow.account.fields.length === 0)) {
    addIssue(items, "blocker", "account.fields", "账号密码模式至少要定义一个账号字段。", "account");
  }

  if (workflow.steps.length === 0) {
    addIssue(items, "blocker", "steps.empty", "当前流程没有任何步骤。", "steps");
  }

  if (enabledTaskSteps.length === 0) {
    addIssue(items, "blocker", "steps.enabled", "当前没有启用的执行步骤。", "steps");
  }

  validateAuth(items, workflow);
  workflow.steps.forEach((step) => validateStep(items, step));

  const sourceMaterial = workflow.meta && workflow.meta.sourceMaterial ? workflow.meta.sourceMaterial : null;
  if (sourceMaterial && Array.isArray(sourceMaterial.warnings)) {
    sourceMaterial.warnings.forEach((warning, index) => {
      addIssue(items, "warning", `source.warning.${index + 1}`, warning, "source");
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    items: clone(items),
    summary: {
      blockingCount: items.filter((item) => item.level === "blocker").length,
      warningCount: items.filter((item) => item.level === "warning").length,
    },
  };
}

module.exports = {
  computeWorkflowDiagnostics,
};
