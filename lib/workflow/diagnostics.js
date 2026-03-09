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

function validateBrowserAction(items, config, target) {
  if (!hasText(config.url)) {
    addIssue(items, "blocker", `${target}.url`, "浏览器动作步骤缺少 URL。", target);
  }

  if (!hasText(config.action)) {
    addIssue(items, "blocker", `${target}.action`, "浏览器动作步骤缺少 action。", target);
  }
}

function validateBrowserExtract(items, config, target) {
  if (!hasText(config.url)) {
    addIssue(items, "warning", `${target}.url`, "浏览器提取步骤没有独立 URL，将依赖前一步打开的页面。", target);
  }

  if (!Array.isArray(config.selectors) || config.selectors.length === 0) {
    addIssue(items, "warning", `${target}.selectors`, "浏览器提取步骤没有 selectors，生成后只能提取非常有限的上下文。", target);
  }
}

function validateCaptcha(items, config, target) {
  if (!hasText(config.provider)) {
    addIssue(items, "warning", `${target}.provider`, "验证码步骤没有 provider，将默认走人工兜底。", target);
  }

  if (!hasText(config.pageUrl)) {
    addIssue(items, "blocker", `${target}.pageUrl`, "验证码步骤缺少 pageUrl。", target);
  }
}

function validateWalletConnect(items, config, target) {
  if (!hasText(config.chain)) {
    addIssue(items, "blocker", `${target}.chain`, "钱包连接步骤缺少 chain。", target);
  }

  if (!hasText(config.strategy)) {
    addIssue(items, "warning", `${target}.strategy`, "钱包连接步骤没有 strategy，将默认优先复用浏览器会话。", target);
  }
}

function validateSolanaSign(items, config, target) {
  if (!hasText(config.walletProvider)) {
    addIssue(items, "warning", `${target}.walletProvider`, "Solana 签名步骤没有 walletProvider。", target);
  }

  if (!hasText(config.message)) {
    addIssue(items, "warning", `${target}.message`, "Solana 签名步骤没有 message，需要运行前补充。", target);
  }
}

function validateSolanaTransfer(items, config, target) {
  if (!hasText(config.to)) {
    addIssue(items, "blocker", `${target}.to`, "Solana 转账步骤缺少接收地址。", target);
  }

  if (!hasText(config.lamports)) {
    addIssue(items, "blocker", `${target}.lamports`, "Solana 转账步骤缺少 lamports。", target);
  }
}

function validateContentUpload(items, config, target) {
  if (!hasText(config.pageUrl)) {
    addIssue(items, "warning", `${target}.pageUrl`, "内容上传步骤没有 pageUrl，应用内运行时需要靠人工补齐页面。", target);
  }

  if (!hasText(config.contentType)) {
    addIssue(items, "blocker", `${target}.contentType`, "内容上传步骤缺少 contentType。", target);
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

  if (step.type === "wait") {
    if (Number(config.delayMs || 0) <= 0) {
      addIssue(items, "warning", `${target}.delayMs`, "等待步骤的 delayMs 不大于 0，等于没等待。", target);
    }
    return;
  }

  if (step.type === "browserAction") {
    validateBrowserAction(items, config, target);
    return;
  }

  if (step.type === "browserExtract") {
    validateBrowserExtract(items, config, target);
    return;
  }

  if (step.type === "captchaSolve") {
    validateCaptcha(items, config, target);
    return;
  }

  if (step.type === "walletConnect") {
    validateWalletConnect(items, config, target);
    return;
  }

  if (step.type === "solanaSign") {
    validateSolanaSign(items, config, target);
    return;
  }

  if (step.type === "solanaTransfer") {
    validateSolanaTransfer(items, config, target);
    return;
  }

  if (step.type === "contentUpload") {
    validateContentUpload(items, config, target);
  }
}

function validateAnalysis(items, workflow) {
  const analysis = workflow.analysis || {};
  if (analysis.sourceType === "url" && !hasText(analysis.sourceUrl)) {
    addIssue(items, "warning", "analysis.sourceUrl", "URL 工作流没有记录 sourceUrl，后续复盘会比较困难。", "analysis");
  }

  if (Array.isArray(analysis.warnings)) {
    analysis.warnings.forEach((warning, index) => {
      addIssue(items, "warning", `analysis.warning.${index + 1}`, warning, "analysis");
    });
  }
}

function validateReview(items, workflow) {
  const review = workflow.review || {};
  if (review.requiresHumanReview) {
    const reasons = Array.isArray(review.reasons) ? review.reasons : [];
    if (reasons.length === 0) {
      addIssue(items, "warning", "review.reasons", "流程被标记为需要人工确认，但没有给出原因。", "review");
      return;
    }

    reasons.forEach((reason, index) => {
      addIssue(items, "warning", `review.reason.${index + 1}`, `需要人工确认: ${reason}`, "review");
    });
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
  validateAnalysis(items, workflow);
  validateReview(items, workflow);

  if (workflow.runtime && workflow.runtime.run && workflow.runtime.run.requiresGeneratedProject && !hasText(workflow.project.lastOutputDir)) {
    addIssue(items, "warning", "runtime.lastOutputDir", "应用内运行依赖已生成项目目录，当前还没有生成记录。", "runtime");
  }

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
