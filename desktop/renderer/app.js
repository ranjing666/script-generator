/* global desktopApi */

const state = {
  meta: null,
  manualLastOutputDir: null,
  importLastOutputDir: null,
  wizardLastOutputDir: null,
  importAnalysis: null,
  wizardAnalysis: null,
  noviceMode: true,
  recentImports: [],
  manualTemplateSearch: "",
  manualTemplateFilter: "all",
  manualPreviewText: "",
  importPreviewText: "",
  manualPreviewRequestId: 0,
  importPreviewRequestId: 0,
};

const MANUAL_TEMPLATES = [
  {
    id: "easy_api_accounts",
    label: "账号密码签到（最稳）",
    summary: "邮箱密码登录 + 签到 + 心跳，适合大多数新手首跑。",
    fitFor: "大部分网页测试网、积分站、签到站",
    difficulty: "low",
    marketTags: ["新手最稳", "接口站", "先跑通"],
    projectName: "easy-api-checkin",
    accountSource: "accounts",
    accountFields: ["email", "password"],
    authMode: "request",
    concurrency: 1,
    useProxy: false,
    repeat: false,
    intervalMinutes: 60,
    presetIds: ["api_checkin", "api_heartbeat"],
  },
  {
    id: "easy_token_keepalive",
    label: "Token 保活（最省事）",
    summary: "已有 token 直接跑任务，最少配置。",
    fitFor: "扩展插件保活、挂机积分、已拿到 token 的项目",
    difficulty: "low",
    marketTags: ["最快启动", "已有 token", "省配置"],
    projectName: "easy-token-keepalive",
    accountSource: "tokens",
    accountFields: [],
    authMode: "account_token",
    concurrency: 1,
    useProxy: false,
    repeat: false,
    intervalMinutes: 60,
    presetIds: ["api_heartbeat", "api_checkin"],
  },
  {
    id: "easy_evm_daily",
    label: "EVM 钱包日常任务",
    summary: "私钥模式，适合测试网签到/领水/链上交互。",
    fitFor: "钱包签名登录、链上交互、领水、合约调用",
    difficulty: "medium",
    marketTags: ["钱包项目", "链上任务", "签名登录"],
    projectName: "easy-evm-daily",
    accountSource: "privateKeys",
    accountFields: [],
    authMode: "evm_sign",
    concurrency: 1,
    useProxy: false,
    repeat: false,
    intervalMinutes: 60,
    presetIds: ["api_checkin", "api_faucet", "contract_call", "wait_step"],
  },
  {
    id: "easy_claim_rewards",
    label: "列表奖励领取",
    summary: "先拉任务列表，再自动领取未 claim 项，适合大多数积分站。",
    fitFor: "任务中心、reward 页面、待领取积分/徽章/奖励",
    difficulty: "low",
    marketTags: ["奖励领取", "接口站", "省配置"],
    projectName: "easy-claim-rewards",
    accountSource: "tokens",
    accountFields: [],
    authMode: "account_token",
    concurrency: 1,
    useProxy: false,
    repeat: false,
    intervalMinutes: 60,
    presetIds: ["api_claim_list", "api_heartbeat"],
  },
  {
    id: "easy_batch_submit",
    label: "批量任务提交",
    summary: "把任务参数写进文本文件，脚本逐行提交，适合答题和内容任务。",
    fitFor: "quiz、答题、内容链接提交、邀请码/任务 ID 批量上报",
    difficulty: "medium",
    marketTags: ["批量提交", "答题任务", "内容任务"],
    projectName: "easy-batch-submit",
    accountSource: "accounts",
    accountFields: ["email", "password"],
    authMode: "request",
    concurrency: 1,
    useProxy: false,
    repeat: false,
    intervalMinutes: 60,
    presetIds: ["api_request", "api_batch_submit", "wait_step"],
  },
  {
    id: "easy_chain_combo",
    label: "链上综合日常",
    summary: "领水 + 合约调用 + 原生转账，适合大多数 EVM 测试网日常。",
    fitFor: "领水、mint、claim、转账活跃、链上交互",
    difficulty: "medium",
    marketTags: ["链上任务", "EVM", "测试网"],
    projectName: "easy-chain-combo",
    accountSource: "privateKeys",
    accountFields: [],
    authMode: "none",
    concurrency: 1,
    useProxy: false,
    repeat: false,
    intervalMinutes: 60,
    presetIds: ["api_faucet", "contract_call", "native_transfer", "wait_step"],
  },
];

const ACCOUNT_SOURCE_LABELS = {
  accounts: "账号密码",
  tokens: "现成登录凭证(Token)",
  privateKeys: "钱包私钥",
};

const AUTH_MODE_LABELS = {
  request: "账号密码登录",
  account_token: "直接使用 Token",
  evm_sign: "钱包签名登录",
  none: "无需登录",
};

const SOURCE_TYPE_LABELS = {
  auto: "自动识别",
  har: "浏览器抓包(HAR)",
  postman: "Postman 导出",
  curl: "cURL 文本",
};

const REQUEST_KIND_LABELS = {
  auth_login: "登录请求",
  auth_nonce: "签名前置请求",
  api_checkin: "签到请求",
  api_heartbeat: "心跳请求",
  api_faucet: "领水请求",
  claim: "领取请求",
  list: "列表请求",
  request: "普通请求",
};

const TEMPLATE_DIFFICULTY_LABELS = {
  low: "简单",
  medium: "中等",
  high: "偏难",
};

const PRESET_LABELS = {
  api_checkin: "签到",
  api_heartbeat: "心跳",
  api_faucet: "领水",
  api_request: "通用请求",
  api_batch_submit: "批量提交",
  api_claim_list: "列表领取",
  contract_call: "合约调用",
  native_transfer: "原生币转账",
  erc20_transfer: "ERC20 转账",
  deploy_contract: "部署合约",
  wait_step: "等待",
};

const elements = {
  tabWizard: document.getElementById("tabWizard"),
  tabManual: document.getElementById("tabManual"),
  tabImport: document.getElementById("tabImport"),
  panelWizard: document.getElementById("panelWizard"),
  panelManual: document.getElementById("panelManual"),
  panelImport: document.getElementById("panelImport"),
  metaText: document.getElementById("metaText"),
  noviceMode: document.getElementById("noviceMode"),

  wizardProjectName: document.getElementById("wizardProjectName"),
  wizardInputPath: document.getElementById("wizardInputPath"),
  wizardPickFile: document.getElementById("wizardPickFile"),
  wizardCaptureHelp: document.getElementById("wizardCaptureHelp"),
  wizardAnalyze: document.getElementById("wizardAnalyze"),
  wizardGenerate: document.getElementById("wizardGenerate"),
  wizardOpenDir: document.getElementById("wizardOpenDir"),
  wizardStatus: document.getElementById("wizardStatus"),
  wizardDiagnosis: document.getElementById("wizardDiagnosis"),
  recentImportList: document.getElementById("recentImportList"),
  onboardingModal: document.getElementById("onboardingModal"),
  onboardingClose: document.getElementById("onboardingClose"),
  captureGuideModal: document.getElementById("captureGuideModal"),
  captureGuideClose: document.getElementById("captureGuideClose"),
  glossaryOpen: document.getElementById("glossaryOpen"),
  glossaryModal: document.getElementById("glossaryModal"),
  glossaryClose: document.getElementById("glossaryClose"),

  manualTemplate: document.getElementById("manualTemplate"),
  manualApplyTemplate: document.getElementById("manualApplyTemplate"),
  manualQuickGenerate: document.getElementById("manualQuickGenerate"),
  manualTemplateSearch: document.getElementById("manualTemplateSearch"),
  manualTemplateFilters: document.getElementById("manualTemplateFilters"),
  manualProjectName: document.getElementById("manualProjectName"),
  manualOutputDir: document.getElementById("manualOutputDir"),
  manualPickOutput: document.getElementById("manualPickOutput"),
  manualAccountSource: document.getElementById("manualAccountSource"),
  manualAccountFields: document.getElementById("manualAccountFields"),
  manualAuthMode: document.getElementById("manualAuthMode"),
  manualConcurrency: document.getElementById("manualConcurrency"),
  manualUseProxy: document.getElementById("manualUseProxy"),
  manualRepeat: document.getElementById("manualRepeat"),
  manualInterval: document.getElementById("manualInterval"),
  manualPresetList: document.getElementById("manualPresetList"),
  manualTemplateGallery: document.getElementById("manualTemplateGallery"),
  manualGenerate: document.getElementById("manualGenerate"),
  manualOpenDir: document.getElementById("manualOpenDir"),
  manualStatus: document.getElementById("manualStatus"),
  manualDiagnosis: document.getElementById("manualDiagnosis"),
  manualPreviewRefresh: document.getElementById("manualPreviewRefresh"),
  manualPreviewCopy: document.getElementById("manualPreviewCopy"),
  manualPreview: document.getElementById("manualPreview"),

  importProjectName: document.getElementById("importProjectName"),
  importSourceType: document.getElementById("importSourceType"),
  importInputPath: document.getElementById("importInputPath"),
  importPickFile: document.getElementById("importPickFile"),
  importCaptureHelp: document.getElementById("importCaptureHelp"),
  importOutputDir: document.getElementById("importOutputDir"),
  importPickOutput: document.getElementById("importPickOutput"),
  importAccountSource: document.getElementById("importAccountSource"),
  importAccountFields: document.getElementById("importAccountFields"),
  importAuthMode: document.getElementById("importAuthMode"),
  importLoginCandidate: document.getElementById("importLoginCandidate"),
  importNonceCandidate: document.getElementById("importNonceCandidate"),
  importConcurrency: document.getElementById("importConcurrency"),
  importUseProxy: document.getElementById("importUseProxy"),
  importRepeat: document.getElementById("importRepeat"),
  importInterval: document.getElementById("importInterval"),
  importDetect: document.getElementById("importDetect"),
  importAnalyze: document.getElementById("importAnalyze"),
  importGenerate: document.getElementById("importGenerate"),
  importQuickGenerate: document.getElementById("importQuickGenerate"),
  importOpenDir: document.getElementById("importOpenDir"),
  importSummary: document.getElementById("importSummary"),
  importDiagnosis: document.getElementById("importDiagnosis"),
  importConfidenceBadge: document.getElementById("importConfidenceBadge"),
  importConfidenceScore: document.getElementById("importConfidenceScore"),
  importConfidenceMeter: document.getElementById("importConfidenceMeter"),
  importConfidenceText: document.getElementById("importConfidenceText"),
  importConfidenceNotes: document.getElementById("importConfidenceNotes"),
  importCoverageList: document.getElementById("importCoverageList"),
  importSuggestionList: document.getElementById("importSuggestionList"),
  importCandidateList: document.getElementById("importCandidateList"),
  importGroupList: document.getElementById("importGroupList"),
  importPreviewRefresh: document.getElementById("importPreviewRefresh"),
  importPreviewCopy: document.getElementById("importPreviewCopy"),
  importPreview: document.getElementById("importPreview"),
};

const ONBOARDING_KEY = "script_generator_onboarding_seen_v2";
const RECENT_IMPORTS_KEY = "script_generator_recent_imports_v1";

function setStatus(element, text, kind = "") {
  element.classList.remove("warn", "error");
  if (kind) {
    element.classList.add(kind);
  }
  element.textContent = text;
  renderDiagnosticsForStatus(element, text, kind);
}

function setPreviewText(element, text, kind = "") {
  if (!element) {
    return;
  }

  element.classList.remove("is-empty", "is-error", "is-loading");
  if (kind) {
    element.classList.add(`is-${kind}`);
  }
  element.textContent = text;
}

function setCopyButtonEnabled(button, enabled) {
  if (!button) {
    return;
  }
  button.disabled = !enabled;
}

function clearManualPreview(message = "调整配置后，这里会显示即将生成的 project.config.json。") {
  state.manualPreviewRequestId += 1;
  state.manualPreviewText = "";
  setPreviewText(elements.manualPreview, message, "empty");
  setCopyButtonEnabled(elements.manualPreviewCopy, false);
}

function clearImportPreview(message = "分析完成后，这里会显示即将生成的 project.config.json。") {
  state.importPreviewRequestId += 1;
  state.importPreviewText = "";
  setPreviewText(elements.importPreview, message, "empty");
  setCopyButtonEnabled(elements.importPreviewCopy, false);
}

function renderPreviewJson(mode, projectConfig) {
  const text = `${JSON.stringify(projectConfig, null, 2)}\n`;

  if (mode === "manual") {
    state.manualPreviewText = text;
    setPreviewText(elements.manualPreview, text);
    setCopyButtonEnabled(elements.manualPreviewCopy, true);
    return;
  }

  state.importPreviewText = text;
  setPreviewText(elements.importPreview, text);
  setCopyButtonEnabled(elements.importPreviewCopy, true);
}

function showOnboardingIfNeeded() {
  if (!elements.onboardingModal) {
    return;
  }

  const seen = window.localStorage.getItem(ONBOARDING_KEY);
  if (seen === "1") {
    elements.onboardingModal.classList.add("hidden");
    return;
  }
  elements.onboardingModal.classList.remove("hidden");
}

function closeOnboarding() {
  if (!elements.onboardingModal) {
    return;
  }
  window.localStorage.setItem(ONBOARDING_KEY, "1");
  elements.onboardingModal.classList.add("hidden");
}

function openCaptureGuide() {
  if (!elements.captureGuideModal) {
    return;
  }
  elements.captureGuideModal.classList.remove("hidden");
}

function closeCaptureGuide() {
  if (!elements.captureGuideModal) {
    return;
  }
  elements.captureGuideModal.classList.add("hidden");
}

function openGlossary() {
  if (!elements.glossaryModal) {
    return;
  }
  elements.glossaryModal.classList.remove("hidden");
}

function closeGlossary() {
  if (!elements.glossaryModal) {
    return;
  }
  elements.glossaryModal.classList.add("hidden");
}

function toAccountSourceLabel(value) {
  return ACCOUNT_SOURCE_LABELS[value] || String(value || "");
}

function toAuthModeLabel(value) {
  return AUTH_MODE_LABELS[value] || String(value || "");
}

function toSourceTypeLabel(value) {
  return SOURCE_TYPE_LABELS[value] || String(value || "");
}

function toRequestKindLabel(value) {
  return REQUEST_KIND_LABELS[value] || String(value || "");
}

function deriveProjectNameFromPath(inputPath) {
  const fileName = String(inputPath || "")
    .split(/[\\/]/)
    .pop()
    || "my-project";
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "my-project";
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "刚刚";
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPathTail(inputPath) {
  return String(inputPath || "").split(/[\\/]/).pop() || String(inputPath || "");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getAccountFileGuide(accountSource) {
  if (accountSource === "privateKeys") {
    return "账号文件填 `data/privateKeys.txt`，每行一个私钥。";
  }
  if (accountSource === "tokens") {
    return "账号文件填 `data/tokens.txt`，每行一个 token。";
  }
  return "账号文件填 `data/accounts.txt`，默认格式是 `email|password`。";
}

function loadRecentImports() {
  try {
    const raw = window.localStorage.getItem(RECENT_IMPORTS_KEY);
    const parsed = JSON.parse(raw || "[]");
    state.recentImports = Array.isArray(parsed) ? parsed : [];
  } catch {
    state.recentImports = [];
  }
}

function persistRecentImports() {
  window.localStorage.setItem(
    RECENT_IMPORTS_KEY,
    JSON.stringify(state.recentImports.slice(0, 6))
  );
}

function rememberRecentImport(entry) {
  const inputPath = String(entry && entry.inputPath ? entry.inputPath : "").trim();
  if (!inputPath) {
    return;
  }

  const normalized = {
    inputPath,
    sourceType: entry.sourceType || "auto",
    projectName: entry.projectName || deriveProjectNameFromPath(inputPath),
    savedAt: new Date().toISOString(),
  };

  state.recentImports = [
    normalized,
    ...state.recentImports.filter((item) => item.inputPath !== normalized.inputPath),
  ].slice(0, 6);
  persistRecentImports();
  renderRecentImports();
}

function applyRecentImport(entry) {
  const inputPath = String(entry && entry.inputPath ? entry.inputPath : "").trim();
  if (!inputPath) {
    return;
  }

  elements.wizardInputPath.value = inputPath;
  elements.importInputPath.value = inputPath;
  if (entry.sourceType && entry.sourceType !== "auto") {
    elements.importSourceType.value = entry.sourceType;
  }

  if (!elements.wizardProjectName.value.trim() || elements.wizardProjectName.value === "my-first-bot") {
    elements.wizardProjectName.value = entry.projectName || deriveProjectNameFromPath(inputPath);
  }
  if (!elements.importProjectName.value.trim() || elements.importProjectName.value === "desktop-import-bot") {
    elements.importProjectName.value = entry.projectName || deriveProjectNameFromPath(inputPath);
  }
}

function renderRecentImports() {
  if (!elements.recentImportList) {
    return;
  }

  elements.recentImportList.innerHTML = "";
  if (!Array.isArray(state.recentImports) || state.recentImports.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-tip";
    empty.textContent = "还没有最近记录。你分析过一次抓包后，这里会自动保存。";
    elements.recentImportList.appendChild(empty);
    return;
  }

  state.recentImports.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recent-card";
    button.innerHTML = `
      <span class="recent-type">${toSourceTypeLabel(item.sourceType)}</span>
      <strong>${item.projectName || deriveProjectNameFromPath(item.inputPath)}</strong>
      <span class="recent-file">${getPathTail(item.inputPath)}</span>
      <span class="recent-time">${formatTimestamp(item.savedAt)}</span>
    `;
    button.addEventListener("click", () => applyRecentImport(item));
    elements.recentImportList.appendChild(button);
  });
}

function buildDiagnosisCard(tone, title, body) {
  return { tone, title, body };
}

function getDiagnosisTarget(element) {
  if (element === elements.wizardStatus) {
    return {
      container: elements.wizardDiagnosis,
      mode: "wizard",
      analysis: state.wizardAnalysis,
      accountSource: state.wizardAnalysis ? state.wizardAnalysis.accountSource : null,
    };
  }

  if (element === elements.importSummary) {
    return {
      container: elements.importDiagnosis,
      mode: "import",
      analysis: state.importAnalysis,
      accountSource: elements.importAccountSource ? elements.importAccountSource.value : null,
    };
  }

  if (element === elements.manualStatus) {
    return {
      container: elements.manualDiagnosis,
      mode: "manual",
      analysis: null,
      accountSource: elements.manualAccountSource ? elements.manualAccountSource.value : null,
    };
  }

  return null;
}

function buildDiagnosticsForStatus({ mode, text, kind, analysis, accountSource }) {
  const normalized = String(text || "").trim();
  const diagnostics = [];

  if (!normalized) {
    return diagnostics;
  }

  if (/先执行第 1 步|请先选择导入文件|请先选择抓包文件/.test(normalized)) {
    diagnostics.push(
      buildDiagnosisCard(
        "info",
        "先准备抓包文件",
        "优先选 `.har` 文件；如果你不会抓包，直接点“不会抓包？点这里”，按提示操作一遍网页流程再导出。"
      )
    );
  }

  if (/不是有效 JSON/.test(normalized)) {
    diagnostics.push(
      buildDiagnosisCard(
        "error",
        "文件格式坏了",
        "这个文件内容不是正常 JSON。最常见原因是导出中断、手改坏了，或者拿错文件。重新从浏览器/Postman 导出一份新的。"
      )
    );
  }

  if (/缺少 log\.entries/.test(normalized)) {
    diagnostics.push(
      buildDiagnosisCard(
        "error",
        "HAR 导出不完整",
        "当前 HAR 不是标准的完整抓包。回到浏览器 Network 面板，右键请求列表，选择 “Save all as HAR with content”。"
      )
    );
  }

  if (/缺少 item 列表/.test(normalized)) {
    diagnostics.push(
      buildDiagnosisCard(
        "error",
        "Postman 导出类型不对",
        "需要导出的是 Collection，而不是单个 Request。建议导出 Collection v2.1 JSON。"
      )
    );
  }

  if (/没有从抓包文件中解析出可导入请求/.test(normalized)) {
    diagnostics.push(
      buildDiagnosisCard(
        "warn",
        "抓包里没抓到接口",
        "通常是你只打开了网页但没点登录/签到/任务按钮，或者导出的全是静态资源。重新抓一次完整操作流程。"
      )
    );
  }

  if (/签名登录缺少 nonce|缺少 nonce|messageTemplate|messagePath/.test(normalized)) {
    diagnostics.push(
      buildDiagnosisCard(
        "warn",
        "签名登录链路不完整",
        "钱包站通常至少需要 `nonce/challenge -> sign -> login` 三步。抓包时要把这三步都完整操作一遍。"
      )
    );
  }

  if (/没提取到 token|没有从响应里提取到 token/.test(normalized)) {
    diagnostics.push(
      buildDiagnosisCard(
        "warn",
        "Token 提取路径不对",
        "生成后的 `project.config.json` 里，检查 `auth.extractTokenPath` 是否真的指向响应里的 token 字段。"
      )
    );
  }

  if (/没有取到可处理列表/.test(normalized)) {
    diagnostics.push(
      buildDiagnosisCard(
        "warn",
        "列表路径没对上",
        "说明 `itemsPath` 指到的不是数组。去 `project.config.json` 里确认真实列表路径，例如 `data.items` 或 `result.tasks`。"
      )
    );
  }

  if (/缺少 RPC_URL/.test(normalized)) {
    diagnostics.push(
      buildDiagnosisCard(
        "warn",
        "链上节点地址没填",
        "打开生成目录下的 `.env`，填上 `RPC_URL=`。可以去项目方文档找，或者去 Chainlist 复制对应链的 RPC。"
      )
    );
  }

  if (/429|请求太频繁|限流/.test(normalized)) {
    diagnostics.push(
      buildDiagnosisCard(
        "warn",
        "请求太快被限流了",
        "把并发先降到 1，必要时在任务之间加等待步骤，或者换代理。对新手来说，先跑慢一点比跑快更稳。"
      )
    );
  }

  if (/unable to get local issuer certificate/i.test(normalized)) {
    diagnostics.push(
      buildDiagnosisCard(
        "warn",
        "目标站证书链异常",
        "这通常不是生成器挂了，而是示例地址或本机证书环境问题。先换成真实项目接口再测，若只在某台机器出现，再检查系统证书。"
      )
    );
  }

  if (/分析完成/.test(normalized) && analysis) {
    const confidence = getImportConfidence(analysis);
    diagnostics.push(
      buildDiagnosisCard(
        confidence.level === "low" ? "warn" : "info",
        "先看可信度再生成",
        confidence.level === "low"
          ? "当前可信度偏低，建议优先重新抓一次更完整的 HAR，再生成会更稳。"
          : "当前分析结果基本可用。生成后先检查登录接口、token 路径和账号文件，再开始跑。"
      )
    );

    diagnostics.push(
      buildDiagnosisCard(
        "info",
        "账号文件怎么填",
        getAccountFileGuide(accountSource || analysis.accountSource)
      )
    );
  }

  if (/生成成功/.test(normalized)) {
    diagnostics.push(
      buildDiagnosisCard(
        "success",
        "下一步就做这三件事",
        "进入输出目录后，先双击 `1-双击-安装依赖.bat`，再检查 `.env` 和 `data/`，最后双击 `2-双击-启动脚本.bat`。第一次先别急着改太多，优先确认能启动。"
      )
    );
    diagnostics.push(
      buildDiagnosisCard(
        "info",
        "最先要检查的文件",
        "先看 `.env`、`project.config.json` 和 `data/` 目录。大多数跑不通的问题，都会落在这三处。"
      )
    );
  }

  if (/分析失败|生成失败|初始化失败/.test(normalized) && diagnostics.length === 0) {
    diagnostics.push(
      buildDiagnosisCard(
        kind === "error" ? "error" : "warn",
        "当前步骤失败了",
        "先看状态区里的具体报错词；如果还是不懂，就把这一段状态文字原样发出来，我可以直接按报错定位。"
      )
    );
  }

  if (mode === "manual" && /模板已切换|模板已套用/.test(normalized)) {
    diagnostics.push(
      buildDiagnosisCard(
        "info",
        "模板已经准备好",
        "下一步直接点“一键生成（小白）”。如果你只是想先跑通，不建议现在去改高级选项。"
      )
    );
  }

  return diagnostics.slice(0, 4);
}

function renderDiagnosticsForStatus(element, text, kind = "") {
  const target = getDiagnosisTarget(element);
  if (!target || !target.container) {
    return;
  }

  const diagnostics = buildDiagnosticsForStatus({
    mode: target.mode,
    text,
    kind,
    analysis: target.analysis,
    accountSource: target.accountSource,
  });

  target.container.innerHTML = "";
  if (diagnostics.length === 0) {
    return;
  }

  diagnostics.forEach((item) => {
    const card = document.createElement("div");
    card.className = `diagnosis-card is-${item.tone}`;
    card.innerHTML = `
      <div class="diagnosis-title">${item.title}</div>
      <div class="diagnosis-body">${item.body}</div>
    `;
    target.container.appendChild(card);
  });
}

function buildAuthModes(accountSource, preferred = "none") {
  const modes = [];
  if (accountSource === "tokens") {
    modes.push("account_token");
  } else {
    modes.push("none");
    modes.push("request");
    if (accountSource === "privateKeys") {
      modes.push("evm_sign");
    }
  }
  const normalized = modes.includes(preferred) ? preferred : modes[0];
  return { modes, normalized };
}

function fillSelect(select, options, selectedValue, labelBuilder) {
  select.innerHTML = "";
  options.forEach((item) => {
    const value = typeof item === "string" ? item : item.id;
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labelBuilder ? labelBuilder(item) : value;
    if (value === selectedValue) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

function collectCheckedValues(container) {
  return [...container.querySelectorAll("input[type='checkbox']:checked")].map(
    (input) => input.value
  );
}

function toAccountFieldsArray(input) {
  return String(input || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getManualTemplateById(templateId) {
  return MANUAL_TEMPLATES.find((template) => template.id === templateId) || MANUAL_TEMPLATES[0];
}

function buildRunChecklist(outputDir) {
  return [
    "",
    "下一步（照着做就行）:",
    `1. 进入目录: ${outputDir}`,
    "2. 双击: 1-双击-安装依赖.bat",
    "3. 打开: .env 和 data/ 目录里的示例文件，改成你自己的值",
    "4. 双击: 2-双击-启动脚本.bat",
    "5. 看不懂时，先打开: 00-先看这里-零基础说明.md",
  ].join("\n");
}

function getManualProjectPayload() {
  return {
    projectName: elements.manualProjectName.value.trim(),
    outputDir: elements.manualOutputDir.value.trim(),
    accountSource: elements.manualAccountSource.value,
    accountFields: toAccountFieldsArray(elements.manualAccountFields.value),
    authMode: elements.manualAuthMode.value,
    useProxy: elements.manualUseProxy.checked,
    repeat: elements.manualRepeat.checked,
    intervalMinutes: Number(elements.manualInterval.value || 60),
    concurrency: Number(elements.manualConcurrency.value || 1),
    presetIds: collectCheckedValues(elements.manualPresetList),
  };
}

function getImportProjectPayload(sourceType) {
  return {
    projectName: elements.importProjectName.value.trim(),
    sourceType,
    inputPath: elements.importInputPath.value.trim(),
    outputDir: elements.importOutputDir.value.trim(),
    accountSource: elements.importAccountSource.value,
    accountFields: toAccountFieldsArray(elements.importAccountFields.value),
    authMode: elements.importAuthMode.value,
    loginCandidateId: elements.importLoginCandidate.value || null,
    nonceCandidateId: elements.importNonceCandidate.value || null,
    selectedGroupIds: collectCheckedValues(elements.importGroupList),
    useProxy: elements.importUseProxy.checked,
    repeat: elements.importRepeat.checked,
    intervalMinutes: Number(elements.importInterval.value || 60),
    concurrency: Number(elements.importConcurrency.value || 1),
  };
}

function invalidateImportAnalysis(message = "") {
  state.importAnalysis = null;
  elements.importGroupList.innerHTML = "";
  clearImportInsights();
  clearImportPreview("请重新分析后再查看最终配置。");
  if (message) {
    setStatus(elements.importSummary, message, "warn");
  }
}

async function refreshManualPreview() {
  const requestId = ++state.manualPreviewRequestId;
  const payload = getManualProjectPayload();

  if (payload.presetIds.length === 0) {
    clearManualPreview("至少选择一个任务积木后，这里才会显示配置预览。");
    return;
  }

  setCopyButtonEnabled(elements.manualPreviewCopy, false);
  setPreviewText(elements.manualPreview, "正在生成配置预览...", "loading");

  try {
    const preview = await desktopApi.previewManualProject(payload);
    if (requestId !== state.manualPreviewRequestId) {
      return;
    }
    renderPreviewJson("manual", preview.projectConfig);
  } catch (error) {
    if (requestId !== state.manualPreviewRequestId) {
      return;
    }
    state.manualPreviewText = "";
    setPreviewText(
      elements.manualPreview,
      `预览失败: ${error.message || String(error)}`,
      "error"
    );
  }
}

async function refreshImportPreview() {
  const requestId = ++state.importPreviewRequestId;
  const inputPath = elements.importInputPath.value.trim();
  if (!inputPath) {
    clearImportPreview("请先选择导入文件并完成分析。");
    return;
  }

  if (!state.importAnalysis) {
    clearImportPreview("请先点击“分析抓包”，分析完成后这里才会显示配置预览。");
    return;
  }

  const sourceType = elements.importSourceType.value && elements.importSourceType.value !== "auto"
    ? elements.importSourceType.value
    : state.importAnalysis.sourceType;
  const payload = getImportProjectPayload(sourceType);

  if (payload.selectedGroupIds.length === 0) {
    clearImportPreview("至少选择一个任务组后，这里才会显示配置预览。");
    return;
  }

  setCopyButtonEnabled(elements.importPreviewCopy, false);
  setPreviewText(elements.importPreview, "正在生成配置预览...", "loading");

  try {
    const preview = await desktopApi.previewImportProject(payload);
    if (requestId !== state.importPreviewRequestId) {
      return;
    }
    renderPreviewJson("import", preview.projectConfig);
  } catch (error) {
    if (requestId !== state.importPreviewRequestId) {
      return;
    }
    state.importPreviewText = "";
    setPreviewText(
      elements.importPreview,
      `预览失败: ${error.message || String(error)}`,
      "error"
    );
  }
}

function toggleTabs(mode) {
  elements.tabWizard.classList.toggle("active", mode === "wizard");
  elements.tabManual.classList.toggle("active", mode === "manual");
  elements.tabImport.classList.toggle("active", mode === "import");

  elements.panelWizard.classList.toggle("hidden", mode !== "wizard");
  elements.panelManual.classList.toggle("hidden", mode !== "manual");
  elements.panelImport.classList.toggle("hidden", mode !== "import");
}

async function refreshManualPresets(preferredPresetIds = null) {
  const accountSource = elements.manualAccountSource.value;
  const presets = await desktopApi.listManualPresets(accountSource);
  const selectedFromTemplate = Array.isArray(preferredPresetIds)
    ? new Set(preferredPresetIds)
    : null;
  const currentSelected = selectedFromTemplate || new Set(collectCheckedValues(elements.manualPresetList));

  elements.manualPresetList.innerHTML = "";
  presets.forEach((preset) => {
    const wrapper = document.createElement("label");
    wrapper.className = "check-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = preset.id;
    checkbox.checked = currentSelected.size === 0 ? true : currentSelected.has(preset.id);

    const text = document.createElement("div");
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = `${preset.id} | ${preset.label}`;
    const desc = document.createElement("div");
    desc.className = "desc";
    desc.textContent = preset.summary;
    text.appendChild(title);
    text.appendChild(desc);

    wrapper.appendChild(checkbox);
    wrapper.appendChild(text);
    elements.manualPresetList.appendChild(wrapper);
  });
}

function renderManualTemplates() {
  fillSelect(elements.manualTemplate, MANUAL_TEMPLATES, MANUAL_TEMPLATES[0].id, (template) => {
    return `${template.label} | ${template.summary}`;
  });
}

function normalizeForSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function getManualTemplateFilterOptions() {
  const tags = new Set();
  MANUAL_TEMPLATES.forEach((template) => {
    (template.marketTags || []).forEach((tag) => tags.add(tag));
  });

  return [
    { id: "all", label: "全部" },
    ...[...tags].map((tag) => ({
      id: tag,
      label: tag,
    })),
  ];
}

function getFilteredManualTemplates() {
  const keyword = normalizeForSearch(state.manualTemplateSearch);
  const activeFilter = state.manualTemplateFilter || "all";

  return MANUAL_TEMPLATES.filter((template) => {
    const matchesFilter =
      activeFilter === "all" || (template.marketTags || []).includes(activeFilter);
    if (!matchesFilter) {
      return false;
    }

    if (!keyword) {
      return true;
    }

    const searchBlob = [
      template.label,
      template.summary,
      template.fitFor,
      ...(template.marketTags || []),
      ...(template.presetIds || []).map((presetId) => PRESET_LABELS[presetId] || presetId),
      ACCOUNT_SOURCE_LABELS[template.accountSource] || template.accountSource,
      AUTH_MODE_LABELS[template.authMode] || template.authMode,
    ]
      .filter(Boolean)
      .join(" ");

    return normalizeForSearch(searchBlob).includes(keyword);
  });
}

function renderManualTemplateFilters() {
  if (!elements.manualTemplateFilters) {
    return;
  }

  elements.manualTemplateFilters.innerHTML = "";
  getManualTemplateFilterOptions().forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-chip";
    if ((state.manualTemplateFilter || "all") === option.id) {
      button.classList.add("active");
    }
    button.textContent = option.label;
    button.addEventListener("click", () => {
      state.manualTemplateFilter = option.id;
      renderManualTemplateFilters();
      renderManualTemplateGallery();
    });
    elements.manualTemplateFilters.appendChild(button);
  });
}

function renderManualTemplateGallery() {
  if (!elements.manualTemplateGallery) {
    return;
  }

  elements.manualTemplateGallery.innerHTML = "";
  const templates = getFilteredManualTemplates();
  if (templates.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-tip";
    empty.textContent = "没有匹配到模板。换个关键词，或者点“全部”看看。";
    elements.manualTemplateGallery.appendChild(empty);
    return;
  }

  templates.forEach((template) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "template-card";
    if (elements.manualTemplate.value === template.id) {
      button.classList.add("active");
    }
    const presetLabels = (template.presetIds || [])
      .map((presetId) => PRESET_LABELS[presetId] || presetId)
      .join(" / ");
    const tagHtml = (template.marketTags || [])
      .map((tag) => `<span class="template-mini-tag">${tag}</span>`)
      .join("");
    button.innerHTML = `
      <div class="template-card-head">
        <span class="template-tag">${toAccountSourceLabel(template.accountSource)}</span>
        <span class="template-difficulty">${TEMPLATE_DIFFICULTY_LABELS[template.difficulty] || "简单"}</span>
      </div>
      <strong>${template.label}</strong>
      <span>${template.summary}</span>
      <div class="template-fit">适合: ${template.fitFor || "常见测试网任务"}</div>
      <div class="template-flow">内置: ${presetLabels || "基础任务"}</div>
      <div class="template-mini-tags">${tagHtml}</div>
    `;
    button.addEventListener("click", async () => {
      elements.manualTemplate.value = template.id;
      await applyManualTemplate({ preserveProjectName: true });
      renderManualTemplateGallery();
      setStatus(elements.manualStatus, "模板已切换，点“一键生成（小白）”即可。");
    });
    elements.manualTemplateGallery.appendChild(button);
  });
}

function getImportConfidence(analysis) {
  if (!analysis || !Array.isArray(analysis.candidates)) {
    return {
      score: 0,
      level: "empty",
      label: "等待分析",
      text: "分析后，这里会告诉你这份抓包是否适合直接生成。",
      notes: [],
    };
  }

  let score = 38;
  const notes = [];
  const candidateCount = analysis.candidates.length;
  const groupCount = Array.isArray(analysis.groups) ? analysis.groups.length : 0;
  const warningCount = Array.isArray(analysis.warnings) ? analysis.warnings.length : 0;
  const loginCount = Array.isArray(analysis.loginCandidates) ? analysis.loginCandidates.length : 0;
  const nonceCount = Array.isArray(analysis.nonceCandidates) ? analysis.nonceCandidates.length : 0;

  if (analysis.sourceType === "har") {
    score += 22;
    notes.push("HAR 通常信息最全，识别成功率最高。");
  } else if (analysis.sourceType === "postman") {
    score += 16;
    notes.push("Postman 导出结构清晰，适合整理过的接口。");
  } else if (analysis.sourceType === "curl") {
    score += 10;
    notes.push("cURL 适合快速试跑，但上下文通常较少。");
  }

  if (candidateCount >= 8) {
    score += 16;
    notes.push(`已识别 ${candidateCount} 个请求，流程信息较完整。`);
  } else if (candidateCount >= 4) {
    score += 10;
    notes.push(`已识别 ${candidateCount} 个请求，基础流程基本够用。`);
  } else if (candidateCount >= 1) {
    score += 4;
    notes.push(`只识别到 ${candidateCount} 个请求，可能需要补抓完整流程。`);
  }

  if (groupCount >= 3) {
    score += 10;
  } else if (groupCount >= 1) {
    score += 6;
  }

  if (analysis.accountSource === analysis.inferredAccountSource) {
    score += 6;
  }

  if (analysis.authMode === "request") {
    if (loginCount > 0) {
      score += 10;
      notes.push("已识别到登录请求。");
    } else {
      score -= 18;
      notes.push("没找到明确登录请求，后续可能需要手改。");
    }
  } else if (analysis.authMode === "evm_sign") {
    if (loginCount > 0 && nonceCount > 0) {
      score += 14;
      notes.push("已识别签名前置请求和登录请求。");
    } else {
      score -= 22;
      notes.push("签名登录链路不完整，建议重新抓包。");
    }
  } else if (analysis.authMode === "account_token") {
    score += 8;
    notes.push("可直接走 Token 模式，先跑通会更快。");
  }

  score -= warningCount * 12;
  if (warningCount > 0) {
    notes.push(`当前有 ${warningCount} 条警告，需要优先处理。`);
  }

  score = clamp(score, 0, 99);

  if (score >= 80) {
    return {
      score,
      level: "high",
      label: "高",
      text: "这份抓包适合直接生成，通常只需要少量手改。",
      notes: notes.slice(0, 4),
    };
  }

  if (score >= 55) {
    return {
      score,
      level: "medium",
      label: "中",
      text: "这份抓包可以生成，但建议先检查登录链路和关键字段。",
      notes: notes.slice(0, 4),
    };
  }

  return {
    score,
    level: "low",
    label: "低",
    text: "这份抓包信息不够完整，建议重新抓一次更完整流程。",
    notes: notes.slice(0, 4),
  };
}

function renderImportConfidence(analysis) {
  if (!elements.importConfidenceBadge) {
    return;
  }

  const confidence = getImportConfidence(analysis);
  elements.importConfidenceBadge.className = `confidence-badge is-${confidence.level}`;
  elements.importConfidenceBadge.textContent = confidence.level === "empty"
    ? confidence.label
    : `可信度 ${confidence.label}`;
  elements.importConfidenceScore.textContent = confidence.level === "empty"
    ? "--"
    : `${confidence.score}分`;
  elements.importConfidenceMeter.style.width = `${confidence.level === "empty" ? 0 : confidence.score}%`;
  elements.importConfidenceMeter.className = `is-${confidence.level}`;
  elements.importConfidenceText.textContent = confidence.text;
  elements.importConfidenceNotes.innerHTML = "";

  if (!Array.isArray(confidence.notes) || confidence.notes.length === 0) {
    return;
  }

  confidence.notes.forEach((note) => {
    const item = document.createElement("div");
    item.className = "confidence-note";
    item.textContent = note;
    elements.importConfidenceNotes.appendChild(item);
  });
}

async function applyManualTemplate(options = {}) {
  const template = getManualTemplateById(elements.manualTemplate.value);
  const preserveProjectName = Boolean(options.preserveProjectName);
  if (!preserveProjectName || !elements.manualProjectName.value.trim()) {
    elements.manualProjectName.value = template.projectName;
  }

  elements.manualAccountSource.value = template.accountSource;
  elements.manualAccountFields.value = template.accountFields.join(",");
  syncManualAuthModes(template.authMode);
  elements.manualConcurrency.value = String(template.concurrency);
  elements.manualUseProxy.checked = Boolean(template.useProxy);
  elements.manualRepeat.checked = Boolean(template.repeat);
  elements.manualInterval.value = String(template.intervalMinutes || 60);
  elements.manualInterval.disabled = !elements.manualRepeat.checked;
  await refreshManualPresets(template.presetIds);
  renderManualTemplateGallery();
  await refreshManualPreview();
}

function syncManualAuthModes(preferred) {
  const accountSource = elements.manualAccountSource.value;
  const { modes, normalized } = buildAuthModes(accountSource, preferred);
  fillSelect(elements.manualAuthMode, modes, normalized);
  elements.manualAccountFields.disabled = accountSource !== "accounts";
}

function syncImportAuthModes(preferred) {
  const accountSource = elements.importAccountSource.value;
  const { modes, normalized } = buildAuthModes(accountSource, preferred);
  fillSelect(elements.importAuthMode, modes, normalized);
  elements.importAccountFields.disabled = accountSource !== "accounts";
}

function applyNoviceMode(enabled) {
  state.noviceMode = enabled;
  document.body.classList.toggle("novice-mode", enabled);

  if (enabled) {
    elements.manualRepeat.checked = false;
    elements.manualInterval.disabled = true;
    elements.manualConcurrency.value = "1";

    elements.importSourceType.value = "auto";
    elements.importRepeat.checked = false;
    elements.importInterval.disabled = true;
    elements.importConcurrency.value = "1";
  }
}

function renderImportGroups(groups) {
  elements.importGroupList.innerHTML = "";
  groups.forEach((group) => {
    const wrapper = document.createElement("label");
    wrapper.className = "check-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = group.id;
    checkbox.checked = true;

    const text = document.createElement("div");
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = `${group.recommendedOrder}. ${group.label}`;
    const desc = document.createElement("div");
    desc.className = "desc";
    desc.textContent = `${group.taskType} | ${group.summary}`;
    text.appendChild(title);
    text.appendChild(desc);

    wrapper.appendChild(checkbox);
    wrapper.appendChild(text);
    elements.importGroupList.appendChild(wrapper);
  });
}

function buildImportCoverageItems(analysis) {
  if (!analysis || !Array.isArray(analysis.candidates)) {
    return [];
  }

  const candidates = analysis.candidates || [];
  const groups = analysis.groups || [];
  const loginCount = Array.isArray(analysis.loginCandidates) ? analysis.loginCandidates.length : 0;
  const nonceCount = Array.isArray(analysis.nonceCandidates) ? analysis.nonceCandidates.length : 0;
  const hasResponseBody = candidates.some((candidate) => candidate.hasResponseBody);
  const claimListCount = groups.filter((group) => group.taskType === "claimList").length;
  const confidence = getImportConfidence(analysis);

  const items = [];
  items.push(
    hasResponseBody
      ? {
          tone: "good",
          title: "抓包上下文",
          body: "这份抓包里带有响应内容，后面自动识别 token、列表和字段路径会更稳。",
        }
      : {
          tone: "warn",
          title: "抓包上下文",
          body: "这份抓包几乎没有响应内容，能生成骨架，但很多字段可能还要你手动补。",
        }
  );

  if (analysis.authMode === "account_token") {
    items.push({
      tone: "good",
      title: "登录链路",
      body: "当前识别为直接用 Token。只要准备好 token 文件，就能先跑通第一版。",
    });
  } else if (analysis.authMode === "request") {
    items.push(
      loginCount > 0
        ? {
            tone: "good",
            title: "登录链路",
            body: "已经识别到账号登录请求，后面优先检查 token 提取路径即可。",
          }
        : {
            tone: "bad",
            title: "登录链路",
            body: "没有识别到明确登录请求。生成后大概率还要你手动补登录接口。",
          }
    );
  } else if (analysis.authMode === "evm_sign") {
    items.push(
      loginCount > 0 && nonceCount > 0
        ? {
            tone: "good",
            title: "签名链路",
            body: "已经识别到 nonce 和 login 两段，钱包签名登录的基础链路是完整的。",
          }
        : {
            tone: "bad",
            title: "签名链路",
            body: "签名登录缺少 nonce 或 login 请求，建议重新抓完整的钱包签名流程。",
          }
    );
  } else {
    items.push({
      tone: "warn",
      title: "登录链路",
      body: "当前没有明确登录步骤，适合做无需登录或已经拿到凭证的简单任务。",
    });
  }

  items.push(
    groups.length >= 3
      ? {
          tone: "good",
          title: "任务分组",
          body: `系统已拼出 ${groups.length} 组任务，基础执行顺序已经比较完整。`,
        }
      : groups.length >= 1
      ? {
          tone: "warn",
          title: "任务分组",
          body: `目前只拼出 ${groups.length} 组任务，建议先确认是不是少抓了某些关键按钮。`,
        }
      : {
          tone: "bad",
          title: "任务分组",
          body: "还没拼出有效任务组，这份抓包不适合直接生成。",
        }
  );

  items.push(
    claimListCount > 0
      ? {
          tone: "good",
          title: "列表领取",
          body: `已识别 ${claimListCount} 组“列表 + 领取”任务，适合任务站、奖励站这类项目。`,
        }
      : {
          tone: "info",
          title: "列表领取",
          body: "这次没有自动合并出列表领取任务；如果目标站不是任务站，这属于正常现象。",
        }
  );

  items.push(
    confidence.level === "high"
      ? {
          tone: "good",
          title: "直接开跑建议",
          body: "这份抓包适合直接一键生成。先跑第一版，再根据报错微调。",
        }
      : confidence.level === "medium"
      ? {
          tone: "warn",
          title: "直接开跑建议",
          body: "可以直接生成，但生成后先看 `project.config.json`、`.env` 和账号文件。",
        }
      : {
          tone: "bad",
          title: "直接开跑建议",
          body: "建议先重新抓一次更完整的 HAR，再回来生成，会比硬改省时间。",
        }
  );

  return items;
}

function renderImportCoverage(analysis) {
  if (!elements.importCoverageList) {
    return;
  }

  elements.importCoverageList.innerHTML = "";
  const items = buildImportCoverageItems(analysis);
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-tip";
    empty.textContent = "分析后，这里会告诉你这份抓包哪些地方能自动处理，哪些地方可能还要手改。";
    elements.importCoverageList.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = `coverage-card is-${item.tone}`;
    card.innerHTML = `
      <div class="coverage-title">${item.title}</div>
      <div class="coverage-body">${item.body}</div>
    `;
    elements.importCoverageList.appendChild(card);
  });
}

function formatValueForCode(value, indentSize = 4) {
  return JSON.stringify(value, null, 2).split("\n").join(`\n${" ".repeat(indentSize)}`);
}

function buildCandidateCurlSnippet(candidate) {
  const lines = [
    `curl --request ${String(candidate.method || "GET").toUpperCase()} ${JSON.stringify(candidate.url || "")}`,
  ];

  Object.entries(candidate.headers || {}).forEach(([key, value]) => {
    lines.push(`  --header ${JSON.stringify(`${key}: ${value}`)}`);
  });

  if (candidate.body !== undefined) {
    const bodyText =
      typeof candidate.body === "string"
        ? candidate.body
        : JSON.stringify(candidate.body);
    lines.push(`  --data-raw ${JSON.stringify(bodyText)}`);
  }

  return lines.join(" \\\n");
}

function buildCandidateAxiosSnippet(candidate) {
  const lines = [
    'const axios = require("axios");',
    "",
    "async function main() {",
    "  const response = await axios({",
    `    method: ${JSON.stringify(String(candidate.method || "GET").toLowerCase())},`,
    `    url: ${JSON.stringify(candidate.url || "")},`,
    `    headers: ${formatValueForCode(candidate.headers || {}, 4)},`,
  ];

  if (candidate.body !== undefined) {
    lines.push(`    data: ${formatValueForCode(candidate.body, 4)},`);
  }

  lines.push("    timeout: 30000,");
  lines.push("  });");
  lines.push("");
  lines.push("  console.log(response.data);");
  lines.push("}");
  lines.push("");
  lines.push("main().catch((error) => {");
  lines.push("  console.error(error.response?.data || error.message || error);");
  lines.push("});");
  return lines.join("\n");
}

async function copyTextToClipboard(text) {
  if (typeof desktopApi !== "undefined" && desktopApi && typeof desktopApi.copyText === "function") {
    await desktopApi.copyText(text);
    return;
  }

  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    await navigator.clipboard.writeText(text);
    return;
  }

  throw new Error("clipboard unavailable");
}

async function handleCopyAction(button, text) {
  const originalText = button.textContent;
  button.disabled = true;
  try {
    await copyTextToClipboard(text);
    button.textContent = "已复制";
  } catch {
    button.textContent = "复制失败";
  }

  window.setTimeout(() => {
    button.textContent = originalText;
    button.disabled = false;
  }, 1200);
}

function buildImportSuggestions(analysis) {
  const suggestions = [];

  if (analysis.sourceType === "har") {
    suggestions.push("这次使用的是 HAR，信息通常最全，优先推荐新手用这个格式。");
  } else if (analysis.sourceType === "postman") {
    suggestions.push("这次使用的是 Postman 导出，适合接口已经整理好的项目。");
  } else if (analysis.sourceType === "curl") {
    suggestions.push("这次使用的是 cURL 文本，适合先快速试跑 1 到 2 个接口。");
  }

  if ((analysis.candidates || []).length <= 2) {
    suggestions.push("识别到的请求较少，建议确认你抓包时是否把完整流程都操作了一遍。");
  } else {
    suggestions.push(`已识别 ${(analysis.candidates || []).length} 个请求，建议先看前几个“登录/签到/claim”相关请求。`);
  }

  if (analysis.authMode === "evm_sign") {
    suggestions.push("当前识别为钱包签名登录，生成后优先检查 nonce、message 和 token 提取路径。");
  } else if (analysis.authMode === "request") {
    suggestions.push("当前识别为账号密码登录，生成后优先检查登录接口地址和 token 提取路径。");
  } else if (analysis.authMode === "account_token") {
    suggestions.push("当前识别为直接用 Token，生成后只要准备好 token 文件就能先跑通。");
  }

  if ((analysis.groups || []).length > 0) {
    suggestions.push(`系统已自动拼出 ${(analysis.groups || []).length} 组任务，默认顺序已经按常见执行顺序排好。`);
  }

  if (Array.isArray(analysis.warnings) && analysis.warnings.length > 0) {
    suggestions.push("分析里带有警告项，生成前先看上面的黄色提示。");
  }

  return suggestions.slice(0, 5);
}

function renderImportSuggestions(analysis) {
  if (!elements.importSuggestionList) {
    return;
  }

  elements.importSuggestionList.innerHTML = "";
  const suggestions = buildImportSuggestions(analysis);
  if (suggestions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-tip";
    empty.textContent = "分析后，这里会给出下一步建议。";
    elements.importSuggestionList.appendChild(empty);
    return;
  }

  suggestions.forEach((text) => {
    const item = document.createElement("div");
    item.className = "advice-item";
    item.textContent = text;
    elements.importSuggestionList.appendChild(item);
  });
}

function renderImportCandidatePreview(analysis) {
  if (!elements.importCandidateList) {
    return;
  }

  elements.importCandidateList.innerHTML = "";
  const candidates = Array.isArray(analysis.candidates) ? analysis.candidates.slice(0, 8) : [];
  if (candidates.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-tip";
    empty.textContent = "分析后，这里会显示识别到的请求预览。";
    elements.importCandidateList.appendChild(empty);
    return;
  }

  candidates.forEach((candidate) => {
    const item = document.createElement("div");
    item.className = "candidate-item";
    item.innerHTML = `
      <div class="candidate-head">
        <span class="candidate-method">${String(candidate.method || "GET").toUpperCase()}</span>
        <span class="candidate-kind">${toRequestKindLabel(candidate.kind)}</span>
      </div>
      <strong>${candidate.name || "unnamed_request"}</strong>
      <span>${candidate.summary || candidate.url || ""}</span>
      <div class="candidate-url">${candidate.url || ""}</div>
      <div class="candidate-meta">
        <span>${candidate.hasResponseBody ? "带响应样本" : "无响应样本"}</span>
        <span>${candidate.body === undefined ? "无请求体" : "带请求体"}</span>
      </div>
      <div class="candidate-actions">
        <button type="button" class="candidate-action-btn" data-copy-kind="curl">复制 cURL</button>
        <button type="button" class="candidate-action-btn" data-copy-kind="axios">复制 Node Axios</button>
      </div>
    `;
    const curlButton = item.querySelector("[data-copy-kind='curl']");
    const axiosButton = item.querySelector("[data-copy-kind='axios']");
    curlButton.addEventListener("click", async () => {
      await handleCopyAction(curlButton, buildCandidateCurlSnippet(candidate));
    });
    axiosButton.addEventListener("click", async () => {
      await handleCopyAction(axiosButton, buildCandidateAxiosSnippet(candidate));
    });
    elements.importCandidateList.appendChild(item);
  });
}

function renderImportInsights(analysis) {
  renderImportConfidence(analysis);
  renderImportCoverage(analysis);
  renderImportSuggestions(analysis);
  renderImportCandidatePreview(analysis);
}

function clearImportInsights() {
  renderImportConfidence({});
  renderImportCoverage({});
  renderImportSuggestions({});
  renderImportCandidatePreview({});
}

function renderImportSummary(analysis, sourceNote = "") {
  const warnings = Array.isArray(analysis.warnings) ? analysis.warnings : [];
  const confidence = getImportConfidence(analysis);
  const lines = [
    sourceNote ? `抓包类型: ${sourceNote}` : null,
    `候选请求: ${(analysis.candidates || []).length}`,
    `推断账号方式: ${toAccountSourceLabel(analysis.inferredAccountSource)}`,
    `当前账号方式: ${toAccountSourceLabel(analysis.accountSource)}`,
    `推断登录方式: ${toAuthModeLabel(analysis.inferredAuthMode)}`,
    `当前登录方式: ${toAuthModeLabel(analysis.authMode)}`,
    `任务组数量: ${analysis.groups.length}`,
    `导入可信度: ${confidence.label}${confidence.level === "empty" ? "" : `（${confidence.score}分）`}`,
  ].filter(Boolean);
  if (warnings.length > 0) {
    lines.push("");
    lines.push("警告:");
    warnings.forEach((warning, index) => {
      lines.push(`${index + 1}. ${warning}`);
    });
  }

  setStatus(elements.importSummary, lines.join("\n"), warnings.length > 0 ? "warn" : "");
}

async function resolveImportSourceType(inputPath) {
  const selected = elements.importSourceType.value;
  if (selected && selected !== "auto") {
    return {
      sourceType: selected,
      reason: `手动选择 ${selected}`,
    };
  }

  const detected = await desktopApi.detectImportSourceType(inputPath);
  elements.importSourceType.value = detected.sourceType;
  return detected;
}

async function analyzeImport() {
  const inputPath = elements.importInputPath.value.trim();
  if (!inputPath) {
    setStatus(elements.importSummary, "请先选择导入文件。", "error");
    return;
  }

  setStatus(elements.importSummary, "正在分析导入文件...");
  try {
    const detected = await resolveImportSourceType(inputPath);
    const analysis = await desktopApi.analyzeImport({
      sourceType: detected.sourceType,
      inputPath,
      ...(state.noviceMode
        ? {}
        : {
            accountSource: elements.importAccountSource.value,
            accountFields: toAccountFieldsArray(elements.importAccountFields.value),
            authMode: elements.importAuthMode.value,
            loginCandidateId: elements.importLoginCandidate.value || null,
            nonceCandidateId: elements.importNonceCandidate.value || null,
          }),
    });

    state.importAnalysis = analysis;
    elements.importAccountSource.value = analysis.accountSource;
    elements.importAccountFields.value = (analysis.accountFields || []).join(",");
    syncImportAuthModes(analysis.authMode);

    fillSelect(
      elements.importLoginCandidate,
      [{ id: "", name: "(自动选择)" }, ...analysis.loginCandidates],
      analysis.defaultLoginCandidateId || "",
      (item) => (item.name ? `${item.id || "auto"} | ${item.name}` : String(item.id || ""))
    );
    fillSelect(
      elements.importNonceCandidate,
      [{ id: "", name: "(自动选择)" }, ...analysis.nonceCandidates],
      analysis.defaultNonceCandidateId || "",
      (item) => (item.name ? `${item.id || "auto"} | ${item.name}` : String(item.id || ""))
    );
    renderImportGroups(analysis.groups);
    renderImportInsights(analysis);
    rememberRecentImport({
      inputPath,
      sourceType: analysis.sourceType,
      projectName: elements.importProjectName.value.trim() || deriveProjectNameFromPath(inputPath),
    });
    renderImportSummary(analysis, `${toSourceTypeLabel(analysis.sourceType)}（${detected.reason}）`);
    await refreshImportPreview();
  } catch (error) {
    state.importAnalysis = null;
    elements.importGroupList.innerHTML = "";
    clearImportInsights();
    clearImportPreview("分析失败后无法预览，请修正后重试。");
    setStatus(elements.importSummary, `分析失败: ${error.message || String(error)}`, "error");
  }
}

async function detectImportTypeOnly() {
  const inputPath = elements.importInputPath.value.trim();
  if (!inputPath) {
    setStatus(elements.importSummary, "请先选择导入文件。", "error");
    return;
  }

  setStatus(elements.importSummary, "正在识别抓包类型...");
  try {
    const detected = await resolveImportSourceType(inputPath);
    rememberRecentImport({
      inputPath,
      sourceType: detected.sourceType,
      projectName: elements.importProjectName.value.trim() || deriveProjectNameFromPath(inputPath),
    });
    clearImportInsights();
    setStatus(
      elements.importSummary,
      `识别完成\n类型: ${toSourceTypeLabel(detected.sourceType)}\n原因: ${detected.reason}`
    );
    clearImportPreview("只识别了抓包类型；先点“分析抓包”，再看最终配置预览。");
  } catch (error) {
    setStatus(elements.importSummary, `识别失败: ${error.message || String(error)}`, "error");
  }
}

async function analyzeWizard() {
  const inputPath = elements.wizardInputPath.value.trim();
  if (!inputPath) {
    setStatus(elements.wizardStatus, "第 1 步还没完成：请先选择抓包文件。", "error");
    return null;
  }

  setStatus(elements.wizardStatus, "正在自动分析抓包文件...");
  try {
    const detected = await desktopApi.detectImportSourceType(inputPath);
    const analysis = await desktopApi.analyzeImport({
      sourceType: detected.sourceType,
      inputPath,
    });
    state.wizardAnalysis = analysis;
    state.importAnalysis = analysis;
    elements.importInputPath.value = inputPath;
    elements.importSourceType.value = detected.sourceType;
    elements.importAccountSource.value = analysis.accountSource;
    elements.importAccountFields.value = (analysis.accountFields || []).join(",");
    syncImportAuthModes(analysis.authMode);
    renderImportGroups(analysis.groups);
    renderImportInsights(analysis);
    await refreshImportPreview();
    rememberRecentImport({
      inputPath,
      sourceType: analysis.sourceType,
      projectName: elements.wizardProjectName.value.trim() || deriveProjectNameFromPath(inputPath),
    });

    const warningText = analysis.warnings && analysis.warnings.length > 0
      ? `\n警告:\n${analysis.warnings.map((warning, index) => `${index + 1}. ${warning}`).join("\n")}`
      : "";
    const confidence = getImportConfidence(analysis);
    setStatus(
      elements.wizardStatus,
      `分析完成\n识别类型: ${toSourceTypeLabel(detected.sourceType)}\n账号方式: ${toAccountSourceLabel(analysis.accountSource)}\n登录方式: ${toAuthModeLabel(analysis.authMode)}\n任务组: ${analysis.groups.length}\n导入可信度: ${confidence.label}（${confidence.score}分）${warningText}`
    );
    return { detected, analysis };
  } catch (error) {
    state.wizardAnalysis = null;
    state.importAnalysis = null;
    clearImportInsights();
    clearImportPreview("自动分析失败，暂时无法展示最终配置。");
    setStatus(elements.wizardStatus, `分析失败: ${error.message || String(error)}`, "error");
    return null;
  }
}

async function generateWizard() {
  setStatus(elements.wizardStatus, "正在执行一键生成...");
  let analysis = state.wizardAnalysis;
  if (!analysis) {
    const wizardResult = await analyzeWizard();
    if (!wizardResult) {
      return;
    }
    analysis = wizardResult.analysis;
  }

  try {
    const projectName = elements.wizardProjectName.value.trim() || "my-first-bot";
    const result = await desktopApi.generateImportProject({
      projectName,
      sourceType: analysis.sourceType,
      inputPath: elements.wizardInputPath.value.trim(),
      outputDir: "",
      accountSource: analysis.accountSource,
      accountFields: analysis.accountFields,
      authMode: analysis.authMode,
      loginCandidateId: analysis.defaultLoginCandidateId || null,
      nonceCandidateId: analysis.defaultNonceCandidateId || null,
      selectedGroupIds: analysis.groups.map((group) => group.id),
      useProxy: false,
      repeat: false,
      intervalMinutes: 60,
      concurrency: 1,
    });

    state.wizardLastOutputDir = result.outputDir;
    elements.wizardOpenDir.disabled = false;
    const warningLines = result.report && result.report.warnings && result.report.warnings.length > 0
      ? `\n警告:\n${result.report.warnings.map((item, index) => `${index + 1}. ${item}`).join("\n")}`
      : "";
    setStatus(
      elements.wizardStatus,
      `生成成功\n输出目录: ${result.outputDir}\n文件数: ${result.files.length}${warningLines}${buildRunChecklist(result.outputDir)}`,
      result.report && result.report.warnings && result.report.warnings.length > 0 ? "warn" : ""
    );
  } catch (error) {
    setStatus(elements.wizardStatus, `生成失败: ${error.message || String(error)}`, "error");
  }
}

async function generateManual() {
  const payload = getManualProjectPayload();
  if (payload.presetIds.length === 0) {
    setStatus(elements.manualStatus, "请至少选择一个任务积木。", "error");
    return;
  }

  setStatus(elements.manualStatus, "正在生成项目...");
  try {
    const result = await desktopApi.generateManualProject(payload);

    state.manualLastOutputDir = result.outputDir;
    elements.manualOpenDir.disabled = false;
    setStatus(
      elements.manualStatus,
      `生成成功\n输出目录: ${result.outputDir}\n文件数: ${result.files.length}${buildRunChecklist(result.outputDir)}`
    );
  } catch (error) {
    setStatus(elements.manualStatus, `生成失败: ${error.message || String(error)}`, "error");
  }
}

async function generateManualQuick() {
  setStatus(elements.manualStatus, "正在按模板一键生成...");
  await applyManualTemplate({ preserveProjectName: true });
  await generateManual();
}

async function generateImport() {
  if (!state.importAnalysis) {
    setStatus(elements.importSummary, "请先点击“分析抓包”。", "error");
    return;
  }

  const sourceType = elements.importSourceType.value && elements.importSourceType.value !== "auto"
    ? elements.importSourceType.value
    : state.importAnalysis.sourceType;
  const payload = getImportProjectPayload(sourceType);
  if (payload.selectedGroupIds.length === 0) {
    setStatus(elements.importSummary, "请至少选择一个任务组。", "error");
    return;
  }

  setStatus(elements.importSummary, "正在生成导入项目...");
  try {
    const result = await desktopApi.generateImportProject(payload);

    state.importLastOutputDir = result.outputDir;
    elements.importOpenDir.disabled = false;
    const warningLines = result.report && result.report.warnings && result.report.warnings.length > 0
      ? `\n警告:\n${result.report.warnings.map((item, index) => `${index + 1}. ${item}`).join("\n")}`
      : "";
    setStatus(
      elements.importSummary,
      `生成成功\n输出目录: ${result.outputDir}\n文件数: ${result.files.length}${warningLines}`,
      result.report && result.report.warnings && result.report.warnings.length > 0 ? "warn" : ""
    );
    setStatus(
      elements.importSummary,
      `${elements.importSummary.textContent}${buildRunChecklist(result.outputDir)}`,
      result.report && result.report.warnings && result.report.warnings.length > 0 ? "warn" : ""
    );
  } catch (error) {
    setStatus(elements.importSummary, `生成失败: ${error.message || String(error)}`, "error");
  }
}

async function generateImportQuick() {
  const inputPath = elements.importInputPath.value.trim();
  if (!inputPath) {
    setStatus(elements.importSummary, "请先选择导入文件。", "error");
    return;
  }

  setStatus(elements.importSummary, "正在自动识别并一键生成...");
  try {
    const detected = await resolveImportSourceType(inputPath);
    const analysis = await desktopApi.analyzeImport({
      sourceType: detected.sourceType,
      inputPath,
    });

    state.importAnalysis = analysis;
    elements.importAccountSource.value = analysis.accountSource;
    elements.importAccountFields.value = (analysis.accountFields || []).join(",");
    syncImportAuthModes(analysis.authMode);
    renderImportGroups(analysis.groups);
    renderImportInsights(analysis);
    rememberRecentImport({
      inputPath,
      sourceType: analysis.sourceType,
      projectName: elements.importProjectName.value.trim() || deriveProjectNameFromPath(inputPath),
    });
    renderImportSummary(analysis, `${toSourceTypeLabel(analysis.sourceType)}（${detected.reason}）`);
    await refreshImportPreview();

    const result = await desktopApi.generateImportProject({
      projectName: elements.importProjectName.value.trim(),
      sourceType: analysis.sourceType,
      inputPath,
      outputDir: state.noviceMode ? "" : elements.importOutputDir.value.trim(),
      accountSource: analysis.accountSource,
      accountFields: analysis.accountFields,
      authMode: analysis.authMode,
      loginCandidateId: analysis.defaultLoginCandidateId || null,
      nonceCandidateId: analysis.defaultNonceCandidateId || null,
      selectedGroupIds: analysis.groups.map((group) => group.id),
      useProxy: false,
      repeat: false,
      intervalMinutes: 60,
      concurrency: 1,
    });

    state.importLastOutputDir = result.outputDir;
    elements.importOpenDir.disabled = false;
    const warningLines = result.report && result.report.warnings && result.report.warnings.length > 0
      ? `\n警告:\n${result.report.warnings.map((item, index) => `${index + 1}. ${item}`).join("\n")}`
      : "";
    setStatus(
      elements.importSummary,
      `一键生成成功\n输出目录: ${result.outputDir}\n文件数: ${result.files.length}${warningLines}${buildRunChecklist(result.outputDir)}`,
      result.report && result.report.warnings && result.report.warnings.length > 0 ? "warn" : ""
    );
  } catch (error) {
    setStatus(elements.importSummary, `一键生成失败: ${error.message || String(error)}`, "error");
  }
}

async function bootstrap() {
  const meta = await desktopApi.getMeta();
  state.meta = meta;
  elements.metaText.textContent = `Version ${meta.appVersion} | 默认输出根目录: ${meta.defaultOutputRoot}`;

  const defaults = await desktopApi.getManualDefaults();
  elements.manualProjectName.value = defaults.projectName;
  elements.manualAccountSource.value = defaults.accountSource;
  elements.manualConcurrency.value = String(defaults.concurrency);
  elements.manualUseProxy.checked = Boolean(defaults.useProxy);
  elements.manualRepeat.checked = Boolean(defaults.repeat);
  elements.manualInterval.value = String(defaults.intervalMinutes || 60);
  elements.manualAccountFields.value = (defaults.accountFields || []).join(",");
  syncManualAuthModes(defaults.authMode);
  renderManualTemplates();
  renderManualTemplateFilters();
  renderManualTemplateGallery();
  await applyManualTemplate();

  elements.importAccountSource.value = "accounts";
  syncImportAuthModes("request");
  fillSelect(elements.importLoginCandidate, [{ id: "", name: "(自动选择)" }], "");
  fillSelect(elements.importNonceCandidate, [{ id: "", name: "(自动选择)" }], "");
  setStatus(elements.importSummary, "请先选择导入文件，再点击“分析抓包”。");
  setStatus(elements.wizardStatus, "先执行第 1 步，再点“开始自动分析”。");
  clearImportInsights();
  clearImportPreview();
  loadRecentImports();
  renderRecentImports();

  applyNoviceMode(true);
  toggleTabs("wizard");
  showOnboardingIfNeeded();
}

elements.tabWizard.addEventListener("click", () => toggleTabs("wizard"));
elements.tabManual.addEventListener("click", () => toggleTabs("manual"));
elements.tabImport.addEventListener("click", () => toggleTabs("import"));

if (elements.onboardingClose) {
  elements.onboardingClose.addEventListener("click", closeOnboarding);
}

if (elements.captureGuideClose) {
  elements.captureGuideClose.addEventListener("click", closeCaptureGuide);
}

if (elements.glossaryOpen) {
  elements.glossaryOpen.addEventListener("click", openGlossary);
}

if (elements.glossaryClose) {
  elements.glossaryClose.addEventListener("click", closeGlossary);
}

if (elements.captureGuideModal) {
  elements.captureGuideModal.addEventListener("click", (event) => {
    if (event.target === elements.captureGuideModal) {
      closeCaptureGuide();
    }
  });
}

if (elements.glossaryModal) {
  elements.glossaryModal.addEventListener("click", (event) => {
    if (event.target === elements.glossaryModal) {
      closeGlossary();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCaptureGuide();
    closeGlossary();
  }
});

elements.noviceMode.addEventListener("change", () => {
  applyNoviceMode(elements.noviceMode.checked);
  refreshManualPreview().catch(() => {});
  if (state.importAnalysis) {
    refreshImportPreview().catch(() => {});
  }
});

elements.manualTemplate.addEventListener("change", async () => {
  await applyManualTemplate({ preserveProjectName: true });
  renderManualTemplateGallery();
});

if (elements.manualTemplateSearch) {
  elements.manualTemplateSearch.addEventListener("input", () => {
    state.manualTemplateSearch = elements.manualTemplateSearch.value || "";
    renderManualTemplateGallery();
  });
}

elements.manualApplyTemplate.addEventListener("click", async () => {
  await applyManualTemplate({ preserveProjectName: true });
  setStatus(elements.manualStatus, "模板已套用，点击“一键生成（小白）”即可。");
});

elements.manualAccountSource.addEventListener("change", async () => {
  syncManualAuthModes(elements.manualAuthMode.value);
  await refreshManualPresets();
  await refreshManualPreview();
});

elements.manualRepeat.addEventListener("change", () => {
  elements.manualInterval.disabled = !elements.manualRepeat.checked;
  refreshManualPreview().catch(() => {});
});

elements.importAccountSource.addEventListener("change", () => {
  syncImportAuthModes(elements.importAuthMode.value);
  invalidateImportAnalysis("账号来源已变更，请重新分析抓包。");
});

elements.importRepeat.addEventListener("change", () => {
  elements.importInterval.disabled = !elements.importRepeat.checked;
  if (state.importAnalysis) {
    refreshImportPreview().catch(() => {});
  }
});

elements.manualPickOutput.addEventListener("click", async () => {
  const selected = await desktopApi.chooseOutputDir();
  if (selected) {
    elements.manualOutputDir.value = selected;
    await refreshManualPreview();
  }
});

elements.importPickOutput.addEventListener("click", async () => {
  const selected = await desktopApi.chooseOutputDir();
  if (selected) {
    elements.importOutputDir.value = selected;
    if (state.importAnalysis) {
      await refreshImportPreview();
    }
  }
});

elements.importPickFile.addEventListener("click", async () => {
  const selected = await desktopApi.chooseImportFile();
  if (selected) {
    state.wizardAnalysis = null;
    elements.importInputPath.value = selected;
    elements.wizardInputPath.value = selected;
    if (!elements.importProjectName.value.trim() || elements.importProjectName.value === "desktop-import-bot") {
      elements.importProjectName.value = deriveProjectNameFromPath(selected);
    }
    if (!elements.wizardProjectName.value.trim() || elements.wizardProjectName.value === "my-first-bot") {
      elements.wizardProjectName.value = deriveProjectNameFromPath(selected);
    }
    invalidateImportAnalysis("导入文件已变更，请重新分析抓包。");
  }
});

elements.wizardProjectName.addEventListener("change", () => {
  if (!elements.importProjectName.value.trim() || elements.importProjectName.value === "desktop-import-bot") {
    elements.importProjectName.value = elements.wizardProjectName.value.trim();
    if (state.importAnalysis) {
      refreshImportPreview().catch(() => {});
    }
  }
});

elements.wizardPickFile.addEventListener("click", async () => {
  const selected = await desktopApi.chooseImportFile();
  if (selected) {
    state.wizardAnalysis = null;
    elements.wizardInputPath.value = selected;
    elements.importInputPath.value = selected;
    if (!elements.wizardProjectName.value.trim() || elements.wizardProjectName.value === "my-first-bot") {
      elements.wizardProjectName.value = deriveProjectNameFromPath(selected);
    }
    if (!elements.importProjectName.value.trim() || elements.importProjectName.value === "desktop-import-bot") {
      elements.importProjectName.value = deriveProjectNameFromPath(selected);
    }
    invalidateImportAnalysis("导入文件已变更，请重新分析抓包。");
  }
});

elements.wizardCaptureHelp.addEventListener("click", openCaptureGuide);
elements.importCaptureHelp.addEventListener("click", openCaptureGuide);

elements.manualGenerate.addEventListener("click", generateManual);
elements.manualQuickGenerate.addEventListener("click", generateManualQuick);
elements.importDetect.addEventListener("click", detectImportTypeOnly);
elements.importAnalyze.addEventListener("click", analyzeImport);
elements.importGenerate.addEventListener("click", generateImport);
elements.importQuickGenerate.addEventListener("click", generateImportQuick);
elements.wizardAnalyze.addEventListener("click", analyzeWizard);
elements.wizardGenerate.addEventListener("click", generateWizard);

[
  elements.manualProjectName,
  elements.manualOutputDir,
  elements.manualAccountFields,
  elements.manualAuthMode,
  elements.manualConcurrency,
  elements.manualUseProxy,
  elements.manualInterval,
].forEach((element) => {
  element.addEventListener("change", () => {
    refreshManualPreview().catch(() => {});
  });
});

elements.manualPresetList.addEventListener("change", () => {
  refreshManualPreview().catch(() => {});
});

elements.manualPreviewRefresh.addEventListener("click", () => {
  refreshManualPreview().catch(() => {});
});

elements.manualPreviewCopy.addEventListener("click", async () => {
  await handleCopyAction(elements.manualPreviewCopy, state.manualPreviewText);
});

[
  elements.importProjectName,
  elements.importOutputDir,
  elements.importUseProxy,
  elements.importConcurrency,
  elements.importInterval,
].forEach((element) => {
  element.addEventListener("change", () => {
    if (state.importAnalysis) {
      refreshImportPreview().catch(() => {});
    }
  });
});

[
  elements.importSourceType,
  elements.importInputPath,
  elements.importAccountFields,
  elements.importAuthMode,
  elements.importLoginCandidate,
  elements.importNonceCandidate,
].forEach((element) => {
  element.addEventListener("change", () => {
    state.wizardAnalysis = null;
    invalidateImportAnalysis("导入参数已变更，请重新分析抓包。");
  });
});

elements.importGroupList.addEventListener("change", () => {
  if (state.importAnalysis) {
    refreshImportPreview().catch(() => {});
  }
});

elements.importPreviewRefresh.addEventListener("click", () => {
  refreshImportPreview().catch(() => {});
});

elements.importPreviewCopy.addEventListener("click", async () => {
  await handleCopyAction(elements.importPreviewCopy, state.importPreviewText);
});

elements.manualOpenDir.addEventListener("click", async () => {
  if (state.manualLastOutputDir) {
    await desktopApi.openPath(state.manualLastOutputDir);
  }
});

elements.importOpenDir.addEventListener("click", async () => {
  if (state.importLastOutputDir) {
    await desktopApi.openPath(state.importLastOutputDir);
  }
});

elements.wizardOpenDir.addEventListener("click", async () => {
  if (state.wizardLastOutputDir) {
    await desktopApi.openPath(state.wizardLastOutputDir);
  }
});

bootstrap().catch((error) => {
  setStatus(
    elements.manualStatus,
    `初始化失败: ${error.message || String(error)}`,
    "error"
  );
});
