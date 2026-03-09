const crypto = require("crypto");
const { buildAuthConfig } = require("../presets");

const WORKFLOW_VERSION = 2;
const STEP_TYPES = [
  "auth",
  "request",
  "claimList",
  "requestFromFile",
  "contractWrite",
  "nativeTransfer",
  "deployContract",
  "wait",
  "browserAction",
  "browserExtract",
  "captchaSolve",
  "walletConnect",
  "solanaSign",
  "solanaTransfer",
  "contentUpload",
];

const STEP_TYPE_DEFINITIONS = {
  auth: {
    id: "auth",
    label: "登录步骤",
    description: "负责账号登录、签名换 token 或直接从账号里读取 token。",
  },
  request: {
    id: "request",
    label: "通用请求",
    description: "单次 API 请求，适合签到、绑定邀请码、提交表单。",
  },
  claimList: {
    id: "claimList",
    label: "列表奖励领取",
    description: "先拉列表，再针对每一项执行 claim。",
  },
  requestFromFile: {
    id: "requestFromFile",
    label: "批量提交行数据",
    description: "从文本文件逐行读取参数，适合 quiz 和批量提交。",
  },
  contractWrite: {
    id: "contractWrite",
    label: "链上合约写入",
    description: "适合 claim、mint、approve、router 交互。",
  },
  nativeTransfer: {
    id: "nativeTransfer",
    label: "原生币转账",
    description: "适合测试网活跃地址、打 gas、模拟转账。",
  },
  deployContract: {
    id: "deployContract",
    label: "部署合约",
    description: "适合测试网 deploy 类型任务。",
  },
  wait: {
    id: "wait",
    label: "等待",
    description: "在任务之间暂停一段时间，降低节奏过快的风险。",
  },
  browserAction: {
    id: "browserAction",
    label: "浏览器动作",
    description: "打开页面、点击、输入、等待，用于官网 URL 起步和人工兜底场景。",
  },
  browserExtract: {
    id: "browserExtract",
    label: "浏览器信息提取",
    description: "提取页面、网络、存储信息，为后续步骤绑定动态字段。",
  },
  captchaSolve: {
    id: "captchaSolve",
    label: "验证码处理",
    description: "优先走验证码服务，失败时切换人工确认。",
  },
  walletConnect: {
    id: "walletConnect",
    label: "钱包连接",
    description: "支持浏览器会话和工具内账号两套身份策略。",
  },
  solanaSign: {
    id: "solanaSign",
    label: "Solana 签名",
    description: "Solana/Phantom 站点的消息签名步骤。",
  },
  solanaTransfer: {
    id: "solanaTransfer",
    label: "Solana 转账",
    description: "Solana 测试网资产转移或活跃地址动作。",
  },
  contentUpload: {
    id: "contentUpload",
    label: "内容上传",
    description: "上传模型、数据集、链接或文本内容的任务步骤。",
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function generateId(prefix = "wf") {
  if (typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function normalizeAccountFields(accountSource, accountFieldsInput) {
  if (accountSource !== "accounts") {
    return [];
  }

  const fields = Array.isArray(accountFieldsInput)
    ? accountFieldsInput
    : String(accountFieldsInput || "")
        .split(",")
        .map((item) => item.trim());
  const unique = [...new Set(fields.filter(Boolean))];

  return unique.length > 0 ? unique : ["email", "password"];
}

function getAccountFile(accountSource) {
  if (accountSource === "privateKeys") {
    return "data/privateKeys.txt";
  }

  if (accountSource === "tokens") {
    return "data/tokens.txt";
  }

  return "data/accounts.txt";
}

function createAccountModel(accountSource = "accounts", accountFields = []) {
  const source = ["privateKeys", "tokens", "accounts"].includes(accountSource)
    ? accountSource
    : "accounts";
  const fields = normalizeAccountFields(source, accountFields);

  return {
    source,
    file: getAccountFile(source),
    delimiter: source === "accounts" ? "|" : null,
    fields,
  };
}

function getAuthModeForAccountSource(accountSource, requestedMode) {
  const mode = requestedMode || "none";

  if (mode === "none" || mode === "account_token") {
    return mode;
  }

  if (mode === "request") {
    return ["accounts", "privateKeys"].includes(accountSource) ? "request" : "none";
  }

  if (mode === "evm_sign") {
    return accountSource === "privateKeys" ? "evm_sign" : "none";
  }

  return "none";
}

function createAuthModel({
  accountSource = "accounts",
  accountFields = [],
  mode = "none",
  source = "manual",
  config = null,
} = {}) {
  const normalizedMode = getAuthModeForAccountSource(accountSource, mode);
  const fields = normalizeAccountFields(accountSource, accountFields);
  const authConfig = normalizedMode === "none"
    ? null
    : clone(
        config
        || buildAuthConfig({
          authMode: normalizedMode,
          accountSource,
          accountFields: fields,
        })
      );

  return {
    mode: normalizedMode,
    enabled: normalizedMode !== "none" && Boolean(authConfig),
    source,
    config: authConfig,
  };
}

function createAnalysisModel(input = {}) {
  const confidence = input.confidence && typeof input.confidence === "object"
    ? input.confidence
    : {};

  return {
    sourceType: String(input.sourceType || "manual"),
    sourceUrl: String(input.sourceUrl || ""),
    title: String(input.title || ""),
    fetchMode: String(input.fetchMode || "manual"),
    fetchedAt: String(input.fetchedAt || ""),
    warnings: Array.isArray(input.warnings) ? input.warnings.filter(Boolean) : [],
    signals: Array.isArray(input.signals) ? input.signals.filter(Boolean) : [],
    adapterCandidates: Array.isArray(input.adapterCandidates)
      ? clone(input.adapterCandidates).filter(Boolean)
      : [],
    confidence: {
      score: Number.isFinite(Number(confidence.score)) ? Number(confidence.score) : 0,
      label: String(confidence.label || "未分析"),
      notes: Array.isArray(confidence.notes) ? confidence.notes.filter(Boolean) : [],
    },
  };
}

function createRuntimeModel(input = {}) {
  const identityPriority = Array.isArray(input.identityPriority)
    ? [...new Set(input.identityPriority.filter(Boolean))]
    : [];

  return {
    executionMode: String(input.executionMode || "generated-project"),
    identityPriority: identityPriority.length > 0 ? identityPriority : ["browserSession", "localAccount"],
    browser: {
      reuseSession: input.browser && input.browser.reuseSession !== false,
      preferredProfile: String(input.browser && input.browser.preferredProfile || ""),
      automationMode: String(input.browser && input.browser.automationMode || "local-first"),
    },
    localAccount: {
      fallbackEnabled: !input.localAccount || input.localAccount.fallbackEnabled !== false,
      preferredSource: String(input.localAccount && input.localAccount.preferredSource || "workflow-account"),
    },
    captcha: {
      provider: String(input.captcha && input.captcha.provider || "manual"),
      allowManualFallback: !input.captcha || input.captcha.allowManualFallback !== false,
    },
    run: {
      status: String(input.run && input.run.status || "idle"),
      lastRunId: String(input.run && input.run.lastRunId || ""),
      requiresGeneratedProject: !input.run || input.run.requiresGeneratedProject !== false,
    },
  };
}

function createReviewModel(input = {}) {
  return {
    status: String(input.status || "not_started"),
    requiresHumanReview: Boolean(input.requiresHumanReview),
    reasons: Array.isArray(input.reasons) ? input.reasons.filter(Boolean) : [],
    lastReviewedAt: String(input.lastReviewedAt || ""),
  };
}

function createArtifactsModel(input = {}) {
  return {
    htmlSnapshotPath: String(input.htmlSnapshotPath || ""),
    analysisSummaryPath: String(input.analysisSummaryPath || ""),
    networkLogPath: String(input.networkLogPath || ""),
    tracePath: String(input.tracePath || ""),
    importFilePath: String(input.importFilePath || ""),
    generatedOutputDir: String(input.generatedOutputDir || ""),
    lastRunLogPath: String(input.lastRunLogPath || ""),
  };
}

function createAdapterModel(input = {}) {
  return {
    id: String(input.id || "manual"),
    label: String(input.label || "手动流程"),
    confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0,
    matchReason: String(input.matchReason || ""),
  };
}

function getDefaultStepConfig(type) {
  if (type === "request") {
    return {
      type: "request",
      name: "custom_request",
      method: "POST",
      url: "https://example.com/api/action",
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        action: "replace_me",
      },
      notes: [],
    };
  }

  if (type === "claimList") {
    return {
      type: "claimList",
      name: "claim_rewards",
      listRequest: {
        method: "GET",
        url: "https://example.com/api/tasks",
        headers: {},
      },
      itemsPath: "data.items",
      filter: {
        field: "claimed",
        equals: false,
      },
      claimRequest: {
        method: "POST",
        url: "https://example.com/api/tasks/{{item.id}}/claim",
        headers: {},
        body: {},
      },
      notes: [],
    };
  }

  if (type === "requestFromFile") {
    return {
      type: "requestFromFile",
      name: "submit_rows",
      dataFile: "data/requestRows.txt",
      delimiter: "|",
      fields: ["taskId", "answer"],
      stopOnError: false,
      delayAfterEachMs: 1500,
      request: {
        method: "POST",
        url: "https://example.com/api/tasks/submit",
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          taskId: "{{row.taskId}}",
          answer: "{{row.answer}}",
        },
      },
      notes: [],
    };
  }

  if (type === "contractWrite") {
    return {
      type: "contractWrite",
      name: "contract_action",
      contractAddress: "0x0000000000000000000000000000000000000000",
      abi: ["function claim() external"],
      method: "claim",
      args: [],
      gasLimit: "300000",
      notes: [],
    };
  }

  if (type === "nativeTransfer") {
    return {
      type: "nativeTransfer",
      name: "send_native_token",
      to: "0x000000000000000000000000000000000000dEaD",
      amount: "0.001",
      amountUnit: "ether",
      notes: [],
    };
  }

  if (type === "deployContract") {
    return {
      type: "deployContract",
      name: "deploy_contract",
      contractName: "HelloTask",
      sourceCode:
        'pragma solidity ^0.8.20; contract HelloTask { string public message = "hello"; }',
      constructorArgs: [],
      gasLimit: "2500000",
      notes: [],
    };
  }

  if (type === "wait") {
    return {
      type: "wait",
      name: "wait_step",
      delayMs: 5000,
      notes: [],
    };
  }

  if (type === "browserAction") {
    return {
      type: "browserAction",
      name: "browser_open_page",
      url: "https://example.com",
      action: "open",
      selector: "",
      inputValue: "",
      waitFor: "load",
      captureNetwork: true,
      notes: [],
    };
  }

  if (type === "browserExtract") {
    return {
      type: "browserExtract",
      name: "extract_browser_context",
      url: "https://example.com",
      selectors: ["button", "form", "input"],
      saveToState: {
        "browser.pageTitle": "page.title",
      },
      extractNetwork: true,
      extractStorage: true,
      notes: [],
    };
  }

  if (type === "captchaSolve") {
    return {
      type: "captchaSolve",
      name: "solve_captcha",
      provider: "capsolver",
      captchaType: "auto",
      siteKey: "",
      pageUrl: "https://example.com",
      timeoutMs: 120000,
      manualFallback: true,
      notes: [],
    };
  }

  if (type === "walletConnect") {
    return {
      type: "walletConnect",
      name: "connect_wallet",
      chain: "evm",
      walletType: "browser_extension",
      provider: "metamask",
      pageUrl: "https://example.com",
      strategy: "browserSessionFirst",
      notes: [],
    };
  }

  if (type === "solanaSign") {
    return {
      type: "solanaSign",
      name: "solana_sign_message",
      pageUrl: "https://example.com",
      walletProvider: "phantom",
      message: "Sign in to continue",
      saveSignatureTo: "state.solana.signature",
      notes: [],
    };
  }

  if (type === "solanaTransfer") {
    return {
      type: "solanaTransfer",
      name: "solana_transfer",
      rpcUrl: "",
      to: "",
      lamports: "1000",
      tokenMint: "",
      notes: [],
    };
  }

  if (type === "contentUpload") {
    return {
      type: "contentUpload",
      name: "upload_content",
      pageUrl: "https://example.com",
      contentType: "dataset_url",
      sourceField: "contentUrl",
      targetSelector: "",
      payload: {
        url: "{{account.contentUrl}}",
      },
      notes: [],
    };
  }

  return {
    type: "auth",
  };
}

function inferStepTitle(type, config) {
  if (config && typeof config.name === "string" && config.name.trim()) {
    return config.name.trim();
  }

  return STEP_TYPE_DEFINITIONS[type]
    ? STEP_TYPE_DEFINITIONS[type].label
    : "步骤";
}

function createWorkflowStep({
  id,
  type,
  title,
  enabled = true,
  source = "manual",
  config = null,
  notes = [],
  metadata = {},
} = {}) {
  const normalizedType = STEP_TYPES.includes(type) ? type : "request";
  const stepConfig = clone(config || getDefaultStepConfig(normalizedType));
  if (normalizedType !== "auth") {
    stepConfig.type = normalizedType;
  }

  return {
    id: id || generateId(normalizedType),
    type: normalizedType,
    title: title || inferStepTitle(normalizedType, stepConfig),
    enabled: enabled !== false,
    source,
    notes: Array.isArray(notes) ? notes.filter(Boolean) : [],
    metadata: metadata && typeof metadata === "object" ? clone(metadata) : {},
    config: stepConfig,
  };
}

function syncAuthStep(workflow) {
  const normalized = clone(workflow);
  normalized.steps = Array.isArray(normalized.steps) ? normalized.steps : [];
  const otherSteps = normalized.steps.filter((step) => step && step.type !== "auth");

  if (!normalized.auth || !normalized.auth.enabled || normalized.auth.mode === "none" || !normalized.auth.config) {
    normalized.auth = {
      mode: "none",
      enabled: false,
      source: normalized.auth && normalized.auth.source ? normalized.auth.source : "manual",
      config: null,
    };
    normalized.steps = otherSteps;
    return normalized;
  }

  const existingAuthStep = normalized.steps.find((step) => step && step.type === "auth");
  const authStep = createWorkflowStep({
    id: existingAuthStep && existingAuthStep.id ? existingAuthStep.id : generateId("auth"),
    type: "auth",
    title: `登录: ${normalized.auth.mode}`,
    enabled: true,
    source: normalized.auth.source || (existingAuthStep && existingAuthStep.source) || "manual",
    notes:
      existingAuthStep && Array.isArray(existingAuthStep.notes)
        ? existingAuthStep.notes
        : (normalized.auth.config && Array.isArray(normalized.auth.config.notes) ? normalized.auth.config.notes : []),
    metadata: existingAuthStep && existingAuthStep.metadata ? existingAuthStep.metadata : {},
    config: normalized.auth.config,
  });

  normalized.steps = [authStep, ...otherSteps];
  return normalized;
}

function createBlankWorkflow({
  projectId,
  projectName = "untitled-workflow",
  sourceKind = "blank",
} = {}) {
  const createdAt = nowIso();

  return {
    meta: {
      id: projectId || generateId("project"),
      name: projectName,
      createdAt,
      updatedAt: createdAt,
      sourceKind,
      workflowVersion: WORKFLOW_VERSION,
      sourceMaterial: null,
    },
    project: {
      name: projectName,
      outputDir: "",
      lastOutputDir: "",
      concurrency: 1,
      repeat: false,
      intervalMinutes: 60,
      useProxy: false,
    },
    account: createAccountModel("accounts", ["email", "password"]),
    auth: createAuthModel({
      accountSource: "accounts",
      accountFields: ["email", "password"],
      mode: "none",
      source: sourceKind === "blank" ? "blank" : "manual",
    }),
    analysis: createAnalysisModel({
      sourceType: sourceKind === "blank" ? "blank" : "manual",
    }),
    runtime: createRuntimeModel(),
    review: createReviewModel(),
    artifacts: createArtifactsModel(),
    adapter: createAdapterModel(),
    steps: [],
    diagnostics: {
      generatedAt: createdAt,
      items: [],
      summary: {
        blockingCount: 0,
        warningCount: 0,
      },
    },
  };
}

function normalizeWorkflow(input) {
  const source = input && typeof input === "object" ? clone(input) : {};
  const base = createBlankWorkflow({
    projectId: source.meta && source.meta.id ? source.meta.id : undefined,
    projectName:
      (source.project && source.project.name)
      || (source.meta && source.meta.name)
      || "untitled-workflow",
    sourceKind: source.meta && source.meta.sourceKind ? source.meta.sourceKind : "blank",
  });

  const workflow = {
    meta: {
      ...base.meta,
      ...(source.meta || {}),
    },
    project: {
      ...base.project,
      ...(source.project || {}),
    },
    account: createAccountModel(
      source.account && source.account.source ? source.account.source : base.account.source,
      source.account && source.account.fields ? source.account.fields : base.account.fields
    ),
    auth: createAuthModel({
      accountSource:
        source.account && source.account.source ? source.account.source : base.account.source,
      accountFields:
        source.account && source.account.fields ? source.account.fields : base.account.fields,
      mode: source.auth && source.auth.mode ? source.auth.mode : "none",
      source: source.auth && source.auth.source ? source.auth.source : "manual",
      config: source.auth && source.auth.config ? source.auth.config : null,
    }),
    analysis: createAnalysisModel(source.analysis || {}),
    runtime: createRuntimeModel(source.runtime || {}),
    review: createReviewModel(source.review || {}),
    artifacts: createArtifactsModel(source.artifacts || {}),
    adapter: createAdapterModel(source.adapter || {}),
    steps: Array.isArray(source.steps)
      ? source.steps
          .filter((step) => step && STEP_TYPES.includes(step.type))
          .map((step) =>
            createWorkflowStep({
              id: step.id,
              type: step.type,
              title: step.title,
              enabled: step.enabled !== false,
              source: step.source || "manual",
              config: step.config || null,
              notes: step.notes || [],
              metadata: step.metadata || {},
            })
          )
      : [],
    diagnostics:
      source.diagnostics && typeof source.diagnostics === "object"
        ? clone(source.diagnostics)
        : clone(base.diagnostics),
  };

  workflow.meta.id = workflow.meta.id || generateId("project");
  workflow.meta.name = workflow.project.name || workflow.meta.name || "untitled-workflow";
  workflow.meta.createdAt = workflow.meta.createdAt || nowIso();
  workflow.meta.updatedAt = workflow.meta.updatedAt || workflow.meta.createdAt;
  workflow.meta.workflowVersion = WORKFLOW_VERSION;

  workflow.project.name = workflow.project.name || workflow.meta.name;
  workflow.project.concurrency = Math.max(1, Number(workflow.project.concurrency || 1));
  workflow.project.repeat = Boolean(workflow.project.repeat);
  workflow.project.intervalMinutes = Math.max(1, Number(workflow.project.intervalMinutes || 60));
  workflow.project.useProxy = Boolean(workflow.project.useProxy);
  workflow.project.outputDir = String(workflow.project.outputDir || "");
  workflow.project.lastOutputDir = String(workflow.project.lastOutputDir || "");

  workflow.analysis = createAnalysisModel(workflow.analysis);
  workflow.runtime = createRuntimeModel(workflow.runtime);
  workflow.review = createReviewModel(workflow.review);
  workflow.artifacts = createArtifactsModel({
    ...workflow.artifacts,
    generatedOutputDir: workflow.project.lastOutputDir || workflow.artifacts.generatedOutputDir,
  });
  workflow.adapter = createAdapterModel(workflow.adapter);

  return syncAuthStep(workflow);
}

function getStepCatalog() {
  return STEP_TYPES
    .filter((type) => type !== "auth")
    .map((type) => ({
      ...STEP_TYPE_DEFINITIONS[type],
      defaultConfig: clone(getDefaultStepConfig(type)),
    }));
}

module.exports = {
  WORKFLOW_VERSION,
  STEP_TYPES,
  STEP_TYPE_DEFINITIONS,
  clone,
  nowIso,
  generateId,
  slugify,
  createAccountModel,
  createAuthModel,
  createAnalysisModel,
  createRuntimeModel,
  createReviewModel,
  createArtifactsModel,
  createAdapterModel,
  createBlankWorkflow,
  createWorkflowStep,
  getDefaultStepConfig,
  getStepCatalog,
  normalizeAccountFields,
  normalizeWorkflow,
  syncAuthStep,
};
