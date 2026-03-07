/* global desktopApi */

const state = {
  meta: null,
  manualLastOutputDir: null,
  importLastOutputDir: null,
  wizardLastOutputDir: null,
  importAnalysis: null,
  wizardAnalysis: null,
  noviceMode: true,
};

const MANUAL_TEMPLATES = [
  {
    id: "easy_api_accounts",
    label: "账号密码签到（最稳）",
    summary: "邮箱密码登录 + 签到 + 心跳，适合大多数新手首跑。",
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
  manualGenerate: document.getElementById("manualGenerate"),
  manualOpenDir: document.getElementById("manualOpenDir"),
  manualStatus: document.getElementById("manualStatus"),

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
  importGroupList: document.getElementById("importGroupList"),
};

const ONBOARDING_KEY = "script_generator_onboarding_seen_v2";

function setStatus(element, text, kind = "") {
  element.classList.remove("warn", "error");
  if (kind) {
    element.classList.add(kind);
  }
  element.textContent = text;
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
    "2. 安装依赖: npm install",
    "3. 复制配置模板(Windows): copy .env.example .env",
    "4. 打开 .env 按需填写（不会填就先留空，先跑起来）",
    "5. 启动脚本: npm start",
  ].join("\n");
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

function renderImportSummary(analysis, sourceNote = "") {
  const warnings = Array.isArray(analysis.warnings) ? analysis.warnings : [];
  const lines = [
    sourceNote ? `抓包类型: ${sourceNote}` : null,
    `候选请求: ${(analysis.candidates || []).length}`,
    `推断账号方式: ${toAccountSourceLabel(analysis.inferredAccountSource)}`,
    `当前账号方式: ${toAccountSourceLabel(analysis.accountSource)}`,
    `推断登录方式: ${toAuthModeLabel(analysis.inferredAuthMode)}`,
    `当前登录方式: ${toAuthModeLabel(analysis.authMode)}`,
    `任务组数量: ${analysis.groups.length}`,
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
    renderImportSummary(analysis, `${toSourceTypeLabel(analysis.sourceType)}（${detected.reason}）`);
  } catch (error) {
    state.importAnalysis = null;
    elements.importGroupList.innerHTML = "";
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
    setStatus(
      elements.importSummary,
      `识别完成\n类型: ${toSourceTypeLabel(detected.sourceType)}\n原因: ${detected.reason}`
    );
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
    elements.importInputPath.value = inputPath;
    elements.importSourceType.value = detected.sourceType;

    const warningText = analysis.warnings && analysis.warnings.length > 0
      ? `\n警告:\n${analysis.warnings.map((warning, index) => `${index + 1}. ${warning}`).join("\n")}`
      : "";
    setStatus(
      elements.wizardStatus,
      `分析完成\n识别类型: ${toSourceTypeLabel(detected.sourceType)}\n账号方式: ${toAccountSourceLabel(analysis.accountSource)}\n登录方式: ${toAuthModeLabel(analysis.authMode)}\n任务组: ${analysis.groups.length}${warningText}`
    );
    return { detected, analysis };
  } catch (error) {
    state.wizardAnalysis = null;
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
  const presetIds = collectCheckedValues(elements.manualPresetList);
  if (presetIds.length === 0) {
    setStatus(elements.manualStatus, "请至少选择一个任务积木。", "error");
    return;
  }

  setStatus(elements.manualStatus, "正在生成项目...");
  try {
    const result = await desktopApi.generateManualProject({
      projectName: elements.manualProjectName.value.trim(),
      outputDir: elements.manualOutputDir.value.trim(),
      accountSource: elements.manualAccountSource.value,
      accountFields: toAccountFieldsArray(elements.manualAccountFields.value),
      authMode: elements.manualAuthMode.value,
      useProxy: elements.manualUseProxy.checked,
      repeat: elements.manualRepeat.checked,
      intervalMinutes: Number(elements.manualInterval.value || 60),
      concurrency: Number(elements.manualConcurrency.value || 1),
      presetIds,
    });

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

  const selectedGroupIds = collectCheckedValues(elements.importGroupList);
  if (selectedGroupIds.length === 0) {
    setStatus(elements.importSummary, "请至少选择一个任务组。", "error");
    return;
  }

  setStatus(elements.importSummary, "正在生成导入项目...");
  try {
    const result = await desktopApi.generateImportProject({
      projectName: elements.importProjectName.value.trim(),
      sourceType: elements.importSourceType.value,
      inputPath: elements.importInputPath.value.trim(),
      outputDir: elements.importOutputDir.value.trim(),
      accountSource: elements.importAccountSource.value,
      accountFields: toAccountFieldsArray(elements.importAccountFields.value),
      authMode: elements.importAuthMode.value,
      loginCandidateId: elements.importLoginCandidate.value || null,
      nonceCandidateId: elements.importNonceCandidate.value || null,
      selectedGroupIds,
      useProxy: elements.importUseProxy.checked,
      repeat: elements.importRepeat.checked,
      intervalMinutes: Number(elements.importInterval.value || 60),
      concurrency: Number(elements.importConcurrency.value || 1),
    });

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
    renderImportSummary(analysis, `${toSourceTypeLabel(analysis.sourceType)}（${detected.reason}）`);

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
  await applyManualTemplate();

  elements.importAccountSource.value = "accounts";
  syncImportAuthModes("request");
  fillSelect(elements.importLoginCandidate, [{ id: "", name: "(自动选择)" }], "");
  fillSelect(elements.importNonceCandidate, [{ id: "", name: "(自动选择)" }], "");
  setStatus(elements.importSummary, "请先选择导入文件，再点击“分析抓包”。");
  setStatus(elements.wizardStatus, "先执行第 1 步，再点“开始自动分析”。");

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
});

elements.manualTemplate.addEventListener("change", async () => {
  await applyManualTemplate({ preserveProjectName: true });
});

elements.manualApplyTemplate.addEventListener("click", async () => {
  await applyManualTemplate({ preserveProjectName: true });
  setStatus(elements.manualStatus, "模板已套用，点击“一键生成（小白）”即可。");
});

elements.manualAccountSource.addEventListener("change", async () => {
  syncManualAuthModes(elements.manualAuthMode.value);
  await refreshManualPresets();
});

elements.manualRepeat.addEventListener("change", () => {
  elements.manualInterval.disabled = !elements.manualRepeat.checked;
});

elements.importAccountSource.addEventListener("change", () => {
  syncImportAuthModes(elements.importAuthMode.value);
});

elements.importRepeat.addEventListener("change", () => {
  elements.importInterval.disabled = !elements.importRepeat.checked;
});

elements.manualPickOutput.addEventListener("click", async () => {
  const selected = await desktopApi.chooseOutputDir();
  if (selected) {
    elements.manualOutputDir.value = selected;
  }
});

elements.importPickOutput.addEventListener("click", async () => {
  const selected = await desktopApi.chooseOutputDir();
  if (selected) {
    elements.importOutputDir.value = selected;
  }
});

elements.importPickFile.addEventListener("click", async () => {
  const selected = await desktopApi.chooseImportFile();
  if (selected) {
    elements.importInputPath.value = selected;
    elements.wizardInputPath.value = selected;
  }
});

elements.wizardProjectName.addEventListener("change", () => {
  if (!elements.importProjectName.value.trim() || elements.importProjectName.value === "desktop-import-bot") {
    elements.importProjectName.value = elements.wizardProjectName.value.trim();
  }
});

elements.wizardPickFile.addEventListener("click", async () => {
  const selected = await desktopApi.chooseImportFile();
  if (selected) {
    elements.wizardInputPath.value = selected;
    elements.importInputPath.value = selected;
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
