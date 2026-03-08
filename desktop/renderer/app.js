/* global desktopApi */

const state = {
  meta: null,
  catalog: null,
  projects: [],
  currentProjectId: null,
  currentWorkflow: null,
  preview: null,
  previewRequestId: 0,
  saveTimer: null,
  previewTimer: null,
};

const SOURCE_KIND_LABELS = {
  blank: "空白流程",
  template: "模板起点",
  import: "抓包导入",
  "workflow-file": "流程文件导入",
};

const STEP_SOURCE_LABELS = {
  blank: "空白",
  template: "模板",
  import: "导入",
  manual: "手动",
};

const elements = {
  metaText: document.getElementById("metaText"),
  saveState: document.getElementById("saveState"),
  saveProjectBtn: document.getElementById("saveProjectBtn"),
  previewBtn: document.getElementById("previewBtn"),
  generateBtn: document.getElementById("generateBtn"),
  createBlankBtn: document.getElementById("createBlankBtn"),
  createImportBtn: document.getElementById("createImportBtn"),
  importWorkflowBtn: document.getElementById("importWorkflowBtn"),
  templateSelect: document.getElementById("templateSelect"),
  createTemplateBtn: document.getElementById("createTemplateBtn"),
  refreshProjectsBtn: document.getElementById("refreshProjectsBtn"),
  projectList: document.getElementById("projectList"),
  projectMetaBadge: document.getElementById("projectMetaBadge"),
  projectNameInput: document.getElementById("projectNameInput"),
  outputDirInput: document.getElementById("outputDirInput"),
  chooseOutputDirBtn: document.getElementById("chooseOutputDirBtn"),
  concurrencyInput: document.getElementById("concurrencyInput"),
  useProxyInput: document.getElementById("useProxyInput"),
  repeatInput: document.getElementById("repeatInput"),
  intervalInput: document.getElementById("intervalInput"),
  sourcePanel: document.getElementById("sourcePanel"),
  accountSourceSelect: document.getElementById("accountSourceSelect"),
  accountFieldsInput: document.getElementById("accountFieldsInput"),
  authModeSelect: document.getElementById("authModeSelect"),
  authEditor: document.getElementById("authEditor"),
  stepTypeSelect: document.getElementById("stepTypeSelect"),
  addStepBtn: document.getElementById("addStepBtn"),
  stepList: document.getElementById("stepList"),
  diagnosticSummary: document.getElementById("diagnosticSummary"),
  diagnosticsList: document.getElementById("diagnosticsList"),
  copyPreviewBtn: document.getElementById("copyPreviewBtn"),
  exportWorkflowBtn: document.getElementById("exportWorkflowBtn"),
  openOutputBtn: document.getElementById("openOutputBtn"),
  previewJson: document.getElementById("previewJson"),
  resultStatus: document.getElementById("resultStatus"),
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsonText(value, fallback) {
  const source = value === undefined ? fallback : value;
  return JSON.stringify(source, null, 2);
}

function getPathTail(inputPath) {
  return String(inputPath || "").split(/[\\/]/).pop() || String(inputPath || "");
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function deriveProjectNameFromPath(inputPath) {
  const fileName = getPathTail(inputPath).replace(/\.[^.]+$/, "");
  return slugify(fileName) || "imported-workflow";
}

function csvToArray(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayToCsv(value) {
  return Array.isArray(value) ? value.join(",") : "";
}

function setByPath(target, pathText, value) {
  const parts = String(pathText || "").split(".").filter(Boolean);
  if (parts.length === 0) {
    return;
  }

  let cursor = target;
  parts.slice(0, -1).forEach((part) => {
    if (!cursor[part] || typeof cursor[part] !== "object") {
      cursor[part] = {};
    }
    cursor = cursor[part];
  });
  cursor[parts[parts.length - 1]] = value;
}

function getByPath(target, pathText) {
  return String(pathText || "")
    .split(".")
    .filter(Boolean)
    .reduce((cursor, part) => (cursor ? cursor[part] : undefined), target);
}

function safeParseJson(text, label) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`${label} 不是有效 JSON。`);
  }
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

function getAllowedAuthModes(accountSource) {
  const base = ["none", "account_token"];
  if (accountSource === "accounts") {
    return [...base, "request"];
  }
  if (accountSource === "privateKeys") {
    return [...base, "request", "evm_sign"];
  }
  return base;
}

function buildDefaultAuthConfig(mode, accountSource, accountFields) {
  if (mode === "none") {
    return null;
  }

  if (mode === "account_token") {
    return {
      type: "account_token",
      tokenField: "token",
      notes: ["当前流程按 token 文件模式运行。"],
    };
  }

  if (mode === "request") {
    const body = {};
    if (accountSource === "accounts") {
      (accountFields || []).forEach((field) => {
        body[field] = `{{account.${field}}}`;
      });
    } else if (accountSource === "privateKeys") {
      body.address = "{{account.address}}";
    }

    return {
      type: "request",
      request: {
        method: "POST",
        url: "https://example.com/api/login",
        headers: {
          "Content-Type": "application/json",
        },
        body,
      },
      extractTokenPath: "data.token",
      notes: [],
    };
  }

  return {
    type: "evm_sign",
    nonceRequest: {
      method: "POST",
      url: "https://example.com/api/auth/nonce",
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        address: "{{account.address}}",
      },
    },
    noncePath: "data.nonce",
    messagePath: "data.message",
    loginRequest: {
      method: "POST",
      url: "https://example.com/api/auth/login",
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        address: "{{account.address}}",
        message: "{{auth.message}}",
        signature: "{{auth.signature}}",
      },
    },
    extractTokenPath: "data.token",
    notes: [],
  };
}

function setSaveState(text, tone = "neutral") {
  elements.saveState.textContent = text;
  elements.saveState.className = `status-pill ${tone}`;
}

function setResultStatus(text, tone = "neutral") {
  elements.resultStatus.textContent = text;
  elements.resultStatus.className = `status-box ${tone}`;
}

function syncLocalAuthStep(workflow) {
  const nonAuthSteps = (workflow.steps || []).filter((step) => step.type !== "auth");
  if (!workflow.auth.enabled || workflow.auth.mode === "none" || !workflow.auth.config) {
    workflow.steps = nonAuthSteps;
    return;
  }

  const existing = (workflow.steps || []).find((step) => step.type === "auth");
  workflow.steps = [
    {
      id: existing && existing.id ? existing.id : `auth_${Date.now()}`,
      type: "auth",
      title: `登录: ${workflow.auth.mode}`,
      enabled: true,
      source: workflow.auth.source || (existing && existing.source) || "manual",
      notes:
        existing && Array.isArray(existing.notes)
          ? existing.notes
          : (Array.isArray(workflow.auth.config.notes) ? workflow.auth.config.notes : []),
      metadata: existing && existing.metadata ? existing.metadata : {},
      config: deepClone(workflow.auth.config),
    },
    ...nonAuthSteps,
  ];
}

function normalizeWorkflowLocal(workflow) {
  const current = workflow;
  current.project.name = String(current.project.name || "untitled-workflow");
  current.project.concurrency = Math.max(1, Number(current.project.concurrency || 1));
  current.project.intervalMinutes = Math.max(1, Number(current.project.intervalMinutes || 60));
  current.project.useProxy = Boolean(current.project.useProxy);
  current.project.repeat = Boolean(current.project.repeat);
  current.project.outputDir = String(current.project.outputDir || "");
  current.project.lastOutputDir = String(current.project.lastOutputDir || "");
  current.meta.name = current.project.name;
  current.account.source = current.account.source || "accounts";
  current.account.file = getAccountFile(current.account.source);
  current.account.delimiter = current.account.source === "accounts" ? "|" : null;
  current.account.fields = current.account.source === "accounts"
    ? (Array.isArray(current.account.fields) && current.account.fields.length > 0 ? current.account.fields : ["email", "password"])
    : [];

  const allowedModes = getAllowedAuthModes(current.account.source);
  if (!allowedModes.includes(current.auth.mode)) {
    current.auth.mode = "none";
  }
  current.auth.enabled = current.auth.mode !== "none";
  if (current.auth.enabled) {
    if (!current.auth.config || current.auth.config.type !== current.auth.mode) {
      current.auth.config = buildDefaultAuthConfig(
        current.auth.mode,
        current.account.source,
        current.account.fields
      );
    }
  } else {
    current.auth.config = null;
  }

  syncLocalAuthStep(current);
  return current;
}

function getCurrentOutputDir() {
  if (!state.currentWorkflow) {
    return "";
  }

  return state.currentWorkflow.project.outputDir || state.currentWorkflow.project.lastOutputDir || "";
}

function mergeProjectSummary(summary) {
  const nextProjects = state.projects.filter((item) => item.id !== summary.id);
  nextProjects.unshift(summary);
  state.projects = nextProjects.sort((left, right) =>
    String(right.updatedAt).localeCompare(String(left.updatedAt))
  );
}

function renderProjectList() {
  elements.projectList.innerHTML = "";
  if (!state.projects.length) {
    elements.projectList.innerHTML = '<div class="empty-block">还没有流程。左上角先创建一个。</div>';
    return;
  }

  state.projects.forEach((project) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `project-item ${project.id === state.currentProjectId ? "active" : ""}`;
    card.dataset.projectId = project.id;
    card.innerHTML = `
      <div class="project-item-head">
        <strong>${escapeHtml(project.name)}</strong>
        <span class="mini-pill">${escapeHtml(SOURCE_KIND_LABELS[project.sourceKind] || project.sourceKind)}</span>
      </div>
      <div class="project-item-meta">
        <span>${project.stepCount} 步</span>
        <span>${project.blockingCount} 阻塞</span>
        <span>${project.warningCount} 警告</span>
      </div>
    `;
    elements.projectList.appendChild(card);
  });
}

function renderProjectBasics() {
  if (!state.currentWorkflow) {
    return;
  }

  const workflow = state.currentWorkflow;
  elements.projectNameInput.value = workflow.project.name || "";
  elements.outputDirInput.value = workflow.project.outputDir || workflow.project.lastOutputDir || "";
  elements.concurrencyInput.value = String(workflow.project.concurrency || 1);
  elements.useProxyInput.checked = Boolean(workflow.project.useProxy);
  elements.repeatInput.checked = Boolean(workflow.project.repeat);
  elements.intervalInput.value = String(workflow.project.intervalMinutes || 60);
  elements.projectMetaBadge.textContent =
    `${SOURCE_KIND_LABELS[workflow.meta.sourceKind] || workflow.meta.sourceKind} · ${workflow.meta.id}`;
}

function renderSourcePanel() {
  if (!state.currentWorkflow) {
    elements.sourcePanel.innerHTML = '<div class="empty-block">没有来源材料。</div>';
    return;
  }

  const source = state.currentWorkflow.meta.sourceMaterial;
  if (!source) {
    elements.sourcePanel.innerHTML = `
      <div class="source-grid">
        <div class="source-card">
          <strong>空白起步</strong>
          <p>当前流程没有抓包或模板来源，适合你手工从零搭建。</p>
        </div>
      </div>
    `;
    return;
  }

  if (source.kind === "template") {
    elements.sourcePanel.innerHTML = `
      <div class="source-grid">
        <div class="source-card">
          <strong>模板起点</strong>
          <p>${escapeHtml(source.templateLabel || "未命名模板")}</p>
        </div>
        <div class="source-card">
          <strong>模板说明</strong>
          <p>${escapeHtml(source.summary || "无")}</p>
        </div>
      </div>
    `;
    return;
  }

  if (source.kind === "workflow-file") {
    elements.sourcePanel.innerHTML = `
      <div class="source-grid">
        <div class="source-card">
          <strong>导入自流程文件</strong>
          <p>${escapeHtml(getPathTail(source.filePath))}</p>
        </div>
        <div class="source-card wide">
          <strong>文件位置</strong>
          <p>${escapeHtml(source.filePath)}</p>
        </div>
      </div>
    `;
    return;
  }

  const warnings = Array.isArray(source.warnings) ? source.warnings : [];
  const confidence = source.confidence || null;
  elements.sourcePanel.innerHTML = `
    <div class="source-grid">
      <div class="source-card">
        <strong>抓包类型</strong>
        <p>${escapeHtml(source.sourceType || "未知")} · ${escapeHtml(source.detectReason || "")}</p>
      </div>
      <div class="source-card">
        <strong>原始文件</strong>
        <p>${escapeHtml(getPathTail(source.inputPath || ""))}</p>
      </div>
      <div class="source-card">
        <strong>识别结果</strong>
        <p>${Number(source.candidateCount || 0)} 个请求 · ${Number(source.taskGroupCount || 0)} 个任务组</p>
      </div>
      <div class="source-card">
        <strong>导入可信度</strong>
        <p>${confidence ? `${confidence.label}（${confidence.score} 分）` : "未计算"}</p>
      </div>
      <div class="source-card wide">
        <strong>风险提示</strong>
        <p>${warnings.length > 0 ? escapeHtml(warnings.join("；")) : "当前没有导入级别警告。"}</p>
      </div>
    </div>
  `;
}

function renderAccountSection() {
  if (!state.currentWorkflow || !state.catalog) {
    return;
  }

  const workflow = state.currentWorkflow;
  elements.accountSourceSelect.innerHTML = state.catalog.accountSources
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`)
    .join("");
  elements.accountSourceSelect.value = workflow.account.source;

  const allowedModes = getAllowedAuthModes(workflow.account.source);
  elements.authModeSelect.innerHTML = state.catalog.authModes
    .filter((item) => allowedModes.includes(item.id))
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`)
    .join("");
  if (!allowedModes.includes(workflow.auth.mode)) {
    workflow.auth.mode = "none";
  }
  elements.authModeSelect.value = workflow.auth.mode;
  elements.accountFieldsInput.value = arrayToCsv(workflow.account.fields);
  elements.accountFieldsInput.disabled = workflow.account.source !== "accounts";

  renderAuthEditor();
}

function renderAuthEditor() {
  if (!state.currentWorkflow) {
    return;
  }

  const workflow = state.currentWorkflow;
  const auth = workflow.auth || {};
  if (!auth.enabled || auth.mode === "none") {
    elements.authEditor.innerHTML = '<div class="empty-block">当前流程不预置登录，生成后会直接执行步骤列表。</div>';
    return;
  }

  if (auth.mode === "account_token") {
    elements.authEditor.innerHTML = `
      <div class="field-grid compact-grid">
        <label>
          tokenField
          <input data-auth-config="tokenField" type="text" value="${escapeHtml(auth.config.tokenField || "token")}" />
        </label>
      </div>
    `;
    return;
  }

  if (auth.mode === "request") {
    elements.authEditor.innerHTML = `
      <div class="field-grid compact-grid">
        <label>
          登录 method
          <input data-auth-config="request.method" type="text" value="${escapeHtml(getByPath(auth.config, "request.method") || "POST")}" />
        </label>
        <label>
          提取 token 路径
          <input data-auth-config="extractTokenPath" type="text" value="${escapeHtml(auth.config.extractTokenPath || "")}" />
        </label>
        <label class="wide">
          登录 URL
          <input data-auth-config="request.url" type="text" value="${escapeHtml(getByPath(auth.config, "request.url") || "")}" />
        </label>
        <label class="wide">
          登录 headers (JSON)
          <textarea data-auth-json="request.headers">${escapeHtml(jsonText(getByPath(auth.config, "request.headers"), {}))}</textarea>
        </label>
        <label class="wide">
          登录 body (JSON)
          <textarea data-auth-json="request.body">${escapeHtml(jsonText(getByPath(auth.config, "request.body"), {}))}</textarea>
        </label>
      </div>
    `;
    return;
  }

  elements.authEditor.innerHTML = `
    <div class="field-grid compact-grid">
      <label>
        nonce method
        <input data-auth-config="nonceRequest.method" type="text" value="${escapeHtml(getByPath(auth.config, "nonceRequest.method") || "POST")}" />
      </label>
      <label>
        noncePath
        <input data-auth-config="noncePath" type="text" value="${escapeHtml(auth.config.noncePath || "")}" />
      </label>
      <label class="wide">
        nonce URL
        <input data-auth-config="nonceRequest.url" type="text" value="${escapeHtml(getByPath(auth.config, "nonceRequest.url") || "")}" />
      </label>
      <label class="wide">
        nonce headers (JSON)
        <textarea data-auth-json="nonceRequest.headers">${escapeHtml(jsonText(getByPath(auth.config, "nonceRequest.headers"), {}))}</textarea>
      </label>
      <label class="wide">
        nonce body (JSON)
        <textarea data-auth-json="nonceRequest.body">${escapeHtml(jsonText(getByPath(auth.config, "nonceRequest.body"), {}))}</textarea>
      </label>
      <label>
        messagePath
        <input data-auth-config="messagePath" type="text" value="${escapeHtml(auth.config.messagePath || "")}" />
      </label>
      <label>
        messageTemplate
        <input data-auth-config="messageTemplate" type="text" value="${escapeHtml(auth.config.messageTemplate || "")}" />
      </label>
      <label>
        提取 token 路径
        <input data-auth-config="extractTokenPath" type="text" value="${escapeHtml(auth.config.extractTokenPath || "")}" />
      </label>
      <label>
        login method
        <input data-auth-config="loginRequest.method" type="text" value="${escapeHtml(getByPath(auth.config, "loginRequest.method") || "POST")}" />
      </label>
      <label class="wide">
        login URL
        <input data-auth-config="loginRequest.url" type="text" value="${escapeHtml(getByPath(auth.config, "loginRequest.url") || "")}" />
      </label>
      <label class="wide">
        login headers (JSON)
        <textarea data-auth-json="loginRequest.headers">${escapeHtml(jsonText(getByPath(auth.config, "loginRequest.headers"), {}))}</textarea>
      </label>
      <label class="wide">
        login body (JSON)
        <textarea data-auth-json="loginRequest.body">${escapeHtml(jsonText(getByPath(auth.config, "loginRequest.body"), {}))}</textarea>
      </label>
    </div>
  `;
}

function renderStepFields(step) {
  const config = step.config || {};
  const commonTop = `
    <div class="field-grid compact-grid">
      <label>
        显示标题
        <input data-step-bind="title" type="text" value="${escapeHtml(step.title || "")}" />
      </label>
      ${config.name !== undefined ? `
        <label>
          脚本步骤名
          <input data-step-config="name" type="text" value="${escapeHtml(config.name || "")}" />
        </label>
      ` : ""}
      <label class="toggle-row">
        <span>启用步骤</span>
        <input data-step-bind-bool="enabled" type="checkbox" ${step.enabled ? "checked" : ""} />
      </label>
    </div>
  `;

  if (step.type === "auth") {
    return `
      ${commonTop}
      <div class="empty-block">登录步骤由上方“账号与登录”区域统一控制。</div>
    `;
  }

  if (step.type === "request") {
    return `
      ${commonTop}
      <div class="field-grid compact-grid">
        <label>
          method
          <input data-step-config="method" type="text" value="${escapeHtml(config.method || "POST")}" />
        </label>
        <label class="wide">
          URL
          <input data-step-config="url" type="text" value="${escapeHtml(config.url || "")}" />
        </label>
        <label class="wide">
          headers (JSON)
          <textarea data-step-json="headers">${escapeHtml(jsonText(config.headers, {}))}</textarea>
        </label>
        <label class="wide">
          body (JSON)
          <textarea data-step-json="body">${escapeHtml(jsonText(config.body, {}))}</textarea>
        </label>
      </div>
    `;
  }

  if (step.type === "requestFromFile") {
    return `
      ${commonTop}
      <div class="field-grid compact-grid">
        <label>
          dataFile
          <input data-step-config="dataFile" type="text" value="${escapeHtml(config.dataFile || "data/requestRows.txt")}" />
        </label>
        <label>
          字段列表
          <input data-step-csv="fields" type="text" value="${escapeHtml(arrayToCsv(config.fields))}" />
        </label>
        <label>
          分隔符
          <input data-step-config="delimiter" type="text" value="${escapeHtml(config.delimiter || "|")}" />
        </label>
        <label>
          单行延迟(ms)
          <input data-step-number="delayAfterEachMs" type="number" min="0" value="${escapeHtml(String(config.delayAfterEachMs || 0))}" />
        </label>
        <label class="toggle-row">
          <span>失败即停</span>
          <input data-step-bool="stopOnError" type="checkbox" ${config.stopOnError ? "checked" : ""} />
        </label>
        <label>
          request.method
          <input data-step-config="request.method" type="text" value="${escapeHtml(getByPath(config, "request.method") || "POST")}" />
        </label>
        <label class="wide">
          request.url
          <input data-step-config="request.url" type="text" value="${escapeHtml(getByPath(config, "request.url") || "")}" />
        </label>
        <label class="wide">
          request.headers (JSON)
          <textarea data-step-json="request.headers">${escapeHtml(jsonText(getByPath(config, "request.headers"), {}))}</textarea>
        </label>
        <label class="wide">
          request.body (JSON)
          <textarea data-step-json="request.body">${escapeHtml(jsonText(getByPath(config, "request.body"), {}))}</textarea>
        </label>
      </div>
    `;
  }

  if (step.type === "claimList") {
    return `
      ${commonTop}
      <div class="field-grid compact-grid">
        <label>
          list.method
          <input data-step-config="listRequest.method" type="text" value="${escapeHtml(getByPath(config, "listRequest.method") || "GET")}" />
        </label>
        <label>
          itemsPath
          <input data-step-config="itemsPath" type="text" value="${escapeHtml(config.itemsPath || "")}" />
        </label>
        <label>
          filter.field
          <input data-step-config="filter.field" type="text" value="${escapeHtml(getByPath(config, "filter.field") || "")}" />
        </label>
        <label>
          filter.equals
          <input data-step-config="filter.equals" type="text" value="${escapeHtml(String(getByPath(config, "filter.equals") ?? ""))}" />
        </label>
        <label class="wide">
          list.url
          <input data-step-config="listRequest.url" type="text" value="${escapeHtml(getByPath(config, "listRequest.url") || "")}" />
        </label>
        <label class="wide">
          list.headers (JSON)
          <textarea data-step-json="listRequest.headers">${escapeHtml(jsonText(getByPath(config, "listRequest.headers"), {}))}</textarea>
        </label>
        <label>
          claim.method
          <input data-step-config="claimRequest.method" type="text" value="${escapeHtml(getByPath(config, "claimRequest.method") || "POST")}" />
        </label>
        <label class="wide">
          claim.url
          <input data-step-config="claimRequest.url" type="text" value="${escapeHtml(getByPath(config, "claimRequest.url") || "")}" />
        </label>
        <label class="wide">
          claim.headers (JSON)
          <textarea data-step-json="claimRequest.headers">${escapeHtml(jsonText(getByPath(config, "claimRequest.headers"), {}))}</textarea>
        </label>
        <label class="wide">
          claim.body (JSON)
          <textarea data-step-json="claimRequest.body">${escapeHtml(jsonText(getByPath(config, "claimRequest.body"), {}))}</textarea>
        </label>
      </div>
    `;
  }

  if (step.type === "contractWrite") {
    return `
      ${commonTop}
      <div class="field-grid compact-grid">
        <label>
          contractAddress
          <input data-step-config="contractAddress" type="text" value="${escapeHtml(config.contractAddress || "")}" />
        </label>
        <label>
          method
          <input data-step-config="method" type="text" value="${escapeHtml(config.method || "")}" />
        </label>
        <label>
          gasLimit
          <input data-step-config="gasLimit" type="text" value="${escapeHtml(config.gasLimit || "")}" />
        </label>
        <label class="wide">
          ABI (JSON)
          <textarea data-step-json="abi">${escapeHtml(jsonText(config.abi, []))}</textarea>
        </label>
        <label class="wide">
          args (JSON)
          <textarea data-step-json="args">${escapeHtml(jsonText(config.args, []))}</textarea>
        </label>
      </div>
    `;
  }

  if (step.type === "nativeTransfer") {
    return `
      ${commonTop}
      <div class="field-grid compact-grid">
        <label>
          to
          <input data-step-config="to" type="text" value="${escapeHtml(config.to || "")}" />
        </label>
        <label>
          amount
          <input data-step-config="amount" type="text" value="${escapeHtml(config.amount || "")}" />
        </label>
        <label>
          amountUnit
          <select data-step-config="amountUnit">
            <option value="ether" ${config.amountUnit === "ether" ? "selected" : ""}>ether</option>
            <option value="wei" ${config.amountUnit === "wei" ? "selected" : ""}>wei</option>
          </select>
        </label>
        <label>
          gasLimit
          <input data-step-config="gasLimit" type="text" value="${escapeHtml(config.gasLimit || "")}" />
        </label>
      </div>
    `;
  }

  if (step.type === "deployContract") {
    return `
      ${commonTop}
      <div class="field-grid compact-grid">
        <label>
          contractName
          <input data-step-config="contractName" type="text" value="${escapeHtml(config.contractName || "")}" />
        </label>
        <label>
          gasLimit
          <input data-step-config="gasLimit" type="text" value="${escapeHtml(config.gasLimit || "")}" />
        </label>
        <label class="wide">
          constructorArgs (JSON)
          <textarea data-step-json="constructorArgs">${escapeHtml(jsonText(config.constructorArgs, []))}</textarea>
        </label>
        <label class="wide">
          sourceCode
          <textarea data-step-config="sourceCode">${escapeHtml(config.sourceCode || "")}</textarea>
        </label>
      </div>
    `;
  }

  return `
    ${commonTop}
    <div class="field-grid compact-grid">
      <label>
        delayMs
        <input data-step-number="delayMs" type="number" min="0" value="${escapeHtml(String(config.delayMs || 0))}" />
      </label>
    </div>
  `;
}

function renderStepList() {
  if (!state.currentWorkflow) {
    elements.stepList.innerHTML = '<div class="empty-block">先创建或加载一个流程。</div>';
    return;
  }

  const steps = state.currentWorkflow.steps || [];
  if (steps.length === 0) {
    elements.stepList.innerHTML = '<div class="empty-block">当前还没有步骤。右上角先新增一个。</div>';
    return;
  }

  elements.stepList.innerHTML = steps
    .map((step, index) => `
      <article class="step-card" data-step-id="${escapeHtml(step.id)}">
        <div class="step-card-head">
          <div class="step-title-block">
            <strong>${escapeHtml(step.title || step.type)}</strong>
            <div class="step-badges">
              <span class="mini-pill">${escapeHtml(step.type)}</span>
              <span class="mini-pill">${escapeHtml(STEP_SOURCE_LABELS[step.source] || step.source)}</span>
              ${step.enabled ? '<span class="mini-pill success">启用</span>' : '<span class="mini-pill warn">禁用</span>'}
            </div>
          </div>
          ${step.type === "auth" ? `
            <div class="inline-actions">
              <span class="helper-copy">由登录配置控制</span>
            </div>
          ` : `
            <div class="inline-actions">
              <button data-step-action="move-up" type="button" ${index === 0 ? "disabled" : ""}>上移</button>
              <button data-step-action="move-down" type="button" ${index === steps.length - 1 ? "disabled" : ""}>下移</button>
              <button data-step-action="duplicate" type="button">复制</button>
              <button data-step-action="delete" type="button">删除</button>
            </div>
          `}
        </div>
        ${renderStepFields(step)}
      </article>
    `)
    .join("");
}

function renderDiagnostics() {
  const diagnostics = state.preview && state.preview.diagnostics
    ? state.preview.diagnostics
    : (state.currentWorkflow ? state.currentWorkflow.diagnostics : null);
  const summary = diagnostics && diagnostics.summary
    ? diagnostics.summary
    : { blockingCount: 0, warningCount: 0 };

  const tone = summary.blockingCount > 0 ? "danger" : summary.warningCount > 0 ? "warn" : "success";
  elements.diagnosticSummary.textContent = `${summary.blockingCount} 阻塞 · ${summary.warningCount} 警告`;
  elements.diagnosticSummary.className = `status-pill ${tone}`;

  if (!diagnostics || !Array.isArray(diagnostics.items) || diagnostics.items.length === 0) {
    elements.diagnosticsList.innerHTML = '<div class="empty-block">当前没有诊断问题，可以直接预览和生成。</div>';
    return;
  }

  elements.diagnosticsList.innerHTML = diagnostics.items
    .map((item) => `
      <div class="diagnostic-item ${escapeHtml(item.level)}">
        <strong>${escapeHtml(item.level === "blocker" ? "阻塞项" : "警告")}</strong>
        <p>${escapeHtml(item.message)}</p>
      </div>
    `)
    .join("");
}

function renderPreview() {
  if (!state.preview || !state.preview.projectConfig) {
    elements.previewJson.textContent = "预览还没生成。点击“刷新预览”或等自动预览完成。";
    return;
  }

  elements.previewJson.textContent = `${JSON.stringify(state.preview.projectConfig, null, 2)}\n`;
}

function renderAll() {
  renderProjectList();
  renderProjectBasics();
  renderSourcePanel();
  renderAccountSection();
  renderStepList();
  renderDiagnostics();
  renderPreview();
}

function scheduleAutoSave() {
  if (!state.currentWorkflow || !state.currentProjectId) {
    return;
  }

  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
  }
  setSaveState("待保存", "warn");
  state.saveTimer = setTimeout(() => {
    saveCurrentProject(true).catch((error) => {
      setResultStatus(`自动保存失败: ${error.message || String(error)}`, "danger");
      setSaveState("保存失败", "danger");
    });
  }, 600);
}

function schedulePreview() {
  if (!state.currentWorkflow) {
    return;
  }

  if (state.previewTimer) {
    clearTimeout(state.previewTimer);
  }
  state.previewTimer = setTimeout(() => {
    refreshPreview(true).catch((error) => {
      setResultStatus(`自动预览失败: ${error.message || String(error)}`, "danger");
    });
  }, 350);
}

function mutateCurrentWorkflow(mutator) {
  if (!state.currentWorkflow) {
    return;
  }

  const nextWorkflow = deepClone(state.currentWorkflow);
  mutator(nextWorkflow);
  normalizeWorkflowLocal(nextWorkflow);
  state.currentWorkflow = nextWorkflow;
  renderAll();
  scheduleAutoSave();
  schedulePreview();
}

async function refreshProjects(selectProjectId) {
  state.projects = await desktopApi.listProjects();
  renderProjectList();
  if (selectProjectId) {
    state.currentProjectId = selectProjectId;
    renderProjectList();
  }
}

async function loadProject(projectId, announceText) {
  const loaded = await desktopApi.loadProject(projectId);
  state.currentProjectId = loaded.summary.id;
  state.currentWorkflow = loaded.workflow;
  normalizeWorkflowLocal(state.currentWorkflow);
  mergeProjectSummary(loaded.summary);
  renderAll();
  await refreshPreview(true);
  setSaveState("已保存", "success");
  if (announceText) {
    setResultStatus(announceText, "success");
  }
}

async function applyLoadedResult(result, message) {
  state.currentProjectId = result.summary.id;
  state.currentWorkflow = result.workflow;
  normalizeWorkflowLocal(state.currentWorkflow);
  mergeProjectSummary(result.summary);
  renderAll();
  await refreshPreview(true);
  setSaveState("已保存", "success");
  setResultStatus(message, "success");
}

async function createBlankProject() {
  const result = await desktopApi.createProject({
    starter: {
      type: "blank",
    },
    projectName: "blank-workflow",
  });
  await applyLoadedResult(result, "已创建空白流程。");
}

async function createTemplateProject() {
  const templateId = elements.templateSelect.value;
  if (!templateId) {
    setResultStatus("请先选择一个模板。", "warn");
    return;
  }

  const template = (state.catalog.templates || []).find((item) => item.id === templateId);
  const result = await desktopApi.createProject({
    starter: {
      type: "template",
      templateId,
    },
    projectName: template ? template.projectName : "template-workflow",
  });
  await applyLoadedResult(result, `已从模板 ${template ? template.label : templateId} 创建流程。`);
}

async function importSourceProject() {
  const inputPath = await desktopApi.chooseImportFile();
  if (!inputPath) {
    return;
  }

  const result = await desktopApi.importSource({
    sourceType: "auto",
    inputPath,
    projectName: deriveProjectNameFromPath(inputPath),
    concurrency: 1,
    repeat: false,
    intervalMinutes: 60,
    useProxy: false,
  });
  await applyLoadedResult(result, `已从 ${getPathTail(inputPath)} 导入流程。`);
}

async function importWorkflowProject() {
  const filePath = await desktopApi.chooseWorkflowFile();
  if (!filePath) {
    return;
  }

  const result = await desktopApi.createProject({
    starter: {
      type: "workflow-file",
      filePath,
    },
    projectName: deriveProjectNameFromPath(filePath),
  });
  await applyLoadedResult(result, `已导入流程文件 ${getPathTail(filePath)}。`);
}

async function saveCurrentProject(silent = false) {
  if (!state.currentWorkflow || !state.currentProjectId) {
    return;
  }

  const saved = await desktopApi.saveProject({
    projectId: state.currentProjectId,
    workflow: state.currentWorkflow,
  });
  state.currentWorkflow = saved.workflow;
  state.currentProjectId = saved.summary.id;
  mergeProjectSummary(saved.summary);
  renderAll();
  setSaveState("已保存", "success");
  if (!silent) {
    setResultStatus("当前流程已保存到项目库。", "success");
  }
}

async function refreshPreview(silent = false) {
  if (!state.currentWorkflow) {
    return;
  }

  const requestId = ++state.previewRequestId;
  const preview = await desktopApi.previewWorkflowExport({
    workflow: state.currentWorkflow,
    outputDir: getCurrentOutputDir(),
  });
  if (requestId !== state.previewRequestId) {
    return;
  }

  state.preview = preview;
  state.currentWorkflow = preview.workflow;
  renderAll();
  if (!silent) {
    setResultStatus("预览已刷新。", "success");
  }
}

async function generateProject() {
  if (!state.currentWorkflow || !state.currentProjectId) {
    return;
  }

  const result = await desktopApi.generateProject({
    projectId: state.currentProjectId,
    workflow: state.currentWorkflow,
    outputDir: getCurrentOutputDir(),
  });

  state.currentWorkflow = result.workflow;
  state.currentProjectId = result.summary.id;
  state.preview = {
    workflow: result.workflow,
    diagnostics: result.diagnostics,
    outputDir: result.outputDir,
    projectConfig: result.projectConfig,
    canGenerate: true,
  };
  mergeProjectSummary(result.summary);
  renderAll();
  setSaveState("已保存", "success");
  setResultStatus(
    `生成成功\n输出目录: ${result.outputDir}\n文件数: ${result.files.length}\n下一步: 先双击 0-双击-运行前检查.bat`,
    "success"
  );
}

async function exportWorkflowFile() {
  if (!state.currentWorkflow) {
    return;
  }

  const suggestedPath = state.meta && state.meta.defaultOutputRoot
    ? `${state.meta.defaultOutputRoot}\\${slugify(state.currentWorkflow.project.name) || "workflow"}.fengflow.json`
    : `${slugify(state.currentWorkflow.project.name) || "workflow"}.fengflow.json`;
  const filePath = await desktopApi.saveWorkflowFileDialog(suggestedPath);
  if (!filePath) {
    return;
  }

  const result = await desktopApi.exportWorkflowFile({
    workflow: state.currentWorkflow,
    filePath,
  });
  setResultStatus(`流程文件已导出到:\n${result.filePath}`, "success");
}

async function openOutputDir() {
  const targetPath = getCurrentOutputDir();
  if (!targetPath) {
    setResultStatus("当前还没有输出目录。先生成项目或手动指定输出目录。", "warn");
    return;
  }

  await desktopApi.openPath(targetPath);
}

function buildStepTypeOptions() {
  if (!state.catalog) {
    return;
  }

  elements.stepTypeSelect.innerHTML = (state.catalog.stepCatalog || [])
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`)
    .join("");
}

function addStep() {
  const stepType = elements.stepTypeSelect.value;
  const definition = (state.catalog.stepCatalog || []).find((item) => item.id === stepType);
  if (!definition) {
    return;
  }

  mutateCurrentWorkflow((workflow) => {
    workflow.steps.push({
      id: `${stepType}_${Date.now()}`,
      type: stepType,
      title: definition.label,
      enabled: true,
      source: "manual",
      notes: [],
      metadata: {},
      config: deepClone(definition.defaultConfig),
    });
  });
}

function handleStepAction(target) {
  const card = target.closest(".step-card");
  if (!card) {
    return;
  }

  const stepId = card.dataset.stepId;
  const action = target.dataset.stepAction;
  mutateCurrentWorkflow((workflow) => {
    const index = workflow.steps.findIndex((step) => step.id === stepId);
    if (index === -1) {
      return;
    }

    if (action === "delete") {
      workflow.steps.splice(index, 1);
      return;
    }

    if (action === "duplicate") {
      const original = deepClone(workflow.steps[index]);
      original.id = `${original.type}_${Date.now()}`;
      original.source = "manual";
      workflow.steps.splice(index + 1, 0, original);
      return;
    }

    if (action === "move-up" && index > 0) {
      const [current] = workflow.steps.splice(index, 1);
      workflow.steps.splice(index - 1, 0, current);
      return;
    }

    if (action === "move-down" && index < workflow.steps.length - 1) {
      const [current] = workflow.steps.splice(index, 1);
      workflow.steps.splice(index + 1, 0, current);
    }
  });
}

function handleStepFieldChange(target) {
  const card = target.closest(".step-card");
  if (!card) {
    return;
  }

  const stepId = card.dataset.stepId;
  mutateCurrentWorkflow((workflow) => {
    const step = workflow.steps.find((item) => item.id === stepId);
    if (!step) {
      return;
    }

    if (target.dataset.stepBind) {
      step[target.dataset.stepBind] = target.value;
      return;
    }

    if (target.dataset.stepBindBool) {
      step[target.dataset.stepBindBool] = target.checked;
      return;
    }

    if (target.dataset.stepConfig) {
      setByPath(step.config, target.dataset.stepConfig, target.value);
      return;
    }

    if (target.dataset.stepNumber) {
      setByPath(step.config, target.dataset.stepNumber, Number(target.value || 0));
      return;
    }

    if (target.dataset.stepBool) {
      setByPath(step.config, target.dataset.stepBool, target.checked);
      return;
    }

    if (target.dataset.stepCsv) {
      setByPath(step.config, target.dataset.stepCsv, csvToArray(target.value));
      return;
    }

    if (target.dataset.stepJson) {
      setByPath(step.config, target.dataset.stepJson, safeParseJson(target.value, "步骤 JSON 字段"));
    }
  });
}

function handleAuthFieldChange(target) {
  if (!state.currentWorkflow) {
    return;
  }

  mutateCurrentWorkflow((workflow) => {
    if (!workflow.auth.config) {
      workflow.auth.config = buildDefaultAuthConfig(
        workflow.auth.mode,
        workflow.account.source,
        workflow.account.fields
      );
    }

    if (target.dataset.authConfig) {
      setByPath(workflow.auth.config, target.dataset.authConfig, target.value);
      return;
    }

    if (target.dataset.authJson) {
      setByPath(workflow.auth.config, target.dataset.authJson, safeParseJson(target.value, "登录 JSON 字段"));
    }
  });
}

async function bootstrap() {
  state.meta = await desktopApi.getMeta();
  state.catalog = await desktopApi.getWorkflowCatalog();
  elements.metaText.textContent =
    `Version ${state.meta.appVersion} · 项目库: ${state.meta.projectLibraryRoot}`;

  elements.templateSelect.innerHTML = (state.catalog.templates || [])
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`)
    .join("");
  elements.accountSourceSelect.innerHTML = (state.catalog.accountSources || [])
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`)
    .join("");
  buildStepTypeOptions();

  await refreshProjects();
  if (state.projects.length > 0) {
    await loadProject(state.projects[0].id, "已加载最近更新的流程。");
  } else {
    await createBlankProject();
  }
}

elements.refreshProjectsBtn.addEventListener("click", async () => {
  await refreshProjects(state.currentProjectId);
  setResultStatus("项目库已刷新。", "success");
});

elements.projectList.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-project-id]");
  if (!target) {
    return;
  }
  await loadProject(target.dataset.projectId, "已切换到选中的流程。");
});

elements.createBlankBtn.addEventListener("click", () => {
  createBlankProject().catch((error) => {
    setResultStatus(`创建空白流程失败: ${error.message || String(error)}`, "danger");
  });
});

elements.createTemplateBtn.addEventListener("click", () => {
  createTemplateProject().catch((error) => {
    setResultStatus(`创建模板流程失败: ${error.message || String(error)}`, "danger");
  });
});

elements.createImportBtn.addEventListener("click", () => {
  importSourceProject().catch((error) => {
    setResultStatus(`抓包导入失败: ${error.message || String(error)}`, "danger");
  });
});

elements.importWorkflowBtn.addEventListener("click", () => {
  importWorkflowProject().catch((error) => {
    setResultStatus(`导入流程文件失败: ${error.message || String(error)}`, "danger");
  });
});

elements.saveProjectBtn.addEventListener("click", () => {
  saveCurrentProject(false).catch((error) => {
    setResultStatus(`保存失败: ${error.message || String(error)}`, "danger");
    setSaveState("保存失败", "danger");
  });
});

elements.previewBtn.addEventListener("click", () => {
  refreshPreview(false).catch((error) => {
    setResultStatus(`预览失败: ${error.message || String(error)}`, "danger");
  });
});

elements.generateBtn.addEventListener("click", () => {
  generateProject().catch((error) => {
    setResultStatus(`生成失败: ${error.message || String(error)}`, "danger");
  });
});

elements.copyPreviewBtn.addEventListener("click", async () => {
  if (!state.preview || !state.preview.projectConfig) {
    setResultStatus("当前没有可复制的预览。", "warn");
    return;
  }
  await desktopApi.copyText(JSON.stringify(state.preview.projectConfig, null, 2));
  setResultStatus("预览 JSON 已复制。", "success");
});

elements.exportWorkflowBtn.addEventListener("click", () => {
  exportWorkflowFile().catch((error) => {
    setResultStatus(`导出流程文件失败: ${error.message || String(error)}`, "danger");
  });
});

elements.openOutputBtn.addEventListener("click", () => {
  openOutputDir().catch((error) => {
    setResultStatus(`打开输出目录失败: ${error.message || String(error)}`, "danger");
  });
});

elements.chooseOutputDirBtn.addEventListener("click", async () => {
  const selected = await desktopApi.chooseOutputDir();
  if (!selected) {
    return;
  }
  mutateCurrentWorkflow((workflow) => {
    workflow.project.outputDir = selected;
  });
});

elements.projectNameInput.addEventListener("change", () => {
  mutateCurrentWorkflow((workflow) => {
    workflow.project.name = elements.projectNameInput.value.trim() || "untitled-workflow";
    workflow.meta.name = workflow.project.name;
  });
});

elements.outputDirInput.addEventListener("change", () => {
  mutateCurrentWorkflow((workflow) => {
    workflow.project.outputDir = elements.outputDirInput.value.trim();
  });
});

elements.concurrencyInput.addEventListener("change", () => {
  mutateCurrentWorkflow((workflow) => {
    workflow.project.concurrency = Math.max(1, Number(elements.concurrencyInput.value || 1));
  });
});

elements.useProxyInput.addEventListener("change", () => {
  mutateCurrentWorkflow((workflow) => {
    workflow.project.useProxy = elements.useProxyInput.checked;
  });
});

elements.repeatInput.addEventListener("change", () => {
  mutateCurrentWorkflow((workflow) => {
    workflow.project.repeat = elements.repeatInput.checked;
  });
});

elements.intervalInput.addEventListener("change", () => {
  mutateCurrentWorkflow((workflow) => {
    workflow.project.intervalMinutes = Math.max(1, Number(elements.intervalInput.value || 60));
  });
});

elements.accountSourceSelect.addEventListener("change", () => {
  mutateCurrentWorkflow((workflow) => {
    workflow.account.source = elements.accountSourceSelect.value;
    workflow.account.file = getAccountFile(workflow.account.source);
    workflow.account.fields = workflow.account.source === "accounts"
      ? (workflow.account.fields.length > 0 ? workflow.account.fields : ["email", "password"])
      : [];

    if (!getAllowedAuthModes(workflow.account.source).includes(workflow.auth.mode)) {
      workflow.auth.mode = "none";
      workflow.auth.config = null;
    } else if (workflow.auth.enabled) {
      workflow.auth.config = buildDefaultAuthConfig(
        workflow.auth.mode,
        workflow.account.source,
        workflow.account.fields
      );
    }
  });
});

elements.accountFieldsInput.addEventListener("change", () => {
  mutateCurrentWorkflow((workflow) => {
    workflow.account.fields = csvToArray(elements.accountFieldsInput.value);
    if (workflow.auth.enabled && workflow.auth.mode === "request") {
      workflow.auth.config = buildDefaultAuthConfig(
        workflow.auth.mode,
        workflow.account.source,
        workflow.account.fields
      );
    }
  });
});

elements.authModeSelect.addEventListener("change", () => {
  mutateCurrentWorkflow((workflow) => {
    workflow.auth.mode = elements.authModeSelect.value;
    workflow.auth.enabled = workflow.auth.mode !== "none";
    workflow.auth.config = workflow.auth.enabled
      ? buildDefaultAuthConfig(workflow.auth.mode, workflow.account.source, workflow.account.fields)
      : null;
    workflow.auth.source = "manual";
  });
});

elements.authEditor.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
    return;
  }

  try {
    handleAuthFieldChange(target);
  } catch (error) {
    setResultStatus(error.message || String(error), "danger");
  }
});

elements.addStepBtn.addEventListener("click", addStep);

elements.stepList.addEventListener("click", (event) => {
  const target = event.target.closest("[data-step-action]");
  if (!target) {
    return;
  }

  handleStepAction(target);
});

elements.stepList.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
    return;
  }

  try {
    handleStepFieldChange(target);
  } catch (error) {
    setResultStatus(error.message || String(error), "danger");
  }
});

bootstrap().catch((error) => {
  setResultStatus(`初始化失败: ${error.message || String(error)}`, "danger");
  setSaveState("初始化失败", "danger");
});
