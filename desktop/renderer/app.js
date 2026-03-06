/* global desktopApi */

const state = {
  meta: null,
  manualLastOutputDir: null,
  importLastOutputDir: null,
  importAnalysis: null,
};

const elements = {
  tabManual: document.getElementById("tabManual"),
  tabImport: document.getElementById("tabImport"),
  panelManual: document.getElementById("panelManual"),
  panelImport: document.getElementById("panelImport"),
  metaText: document.getElementById("metaText"),

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
  importAnalyze: document.getElementById("importAnalyze"),
  importGenerate: document.getElementById("importGenerate"),
  importOpenDir: document.getElementById("importOpenDir"),
  importSummary: document.getElementById("importSummary"),
  importGroupList: document.getElementById("importGroupList"),
};

function setStatus(element, text, kind = "") {
  element.classList.remove("warn", "error");
  if (kind) {
    element.classList.add(kind);
  }
  element.textContent = text;
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

function toggleTabs(mode) {
  const isManual = mode === "manual";
  elements.tabManual.classList.toggle("active", isManual);
  elements.tabImport.classList.toggle("active", !isManual);
  elements.panelManual.classList.toggle("hidden", !isManual);
  elements.panelImport.classList.toggle("hidden", isManual);
}

async function refreshManualPresets() {
  const accountSource = elements.manualAccountSource.value;
  const presets = await desktopApi.listManualPresets(accountSource);
  const currentSelected = new Set(collectCheckedValues(elements.manualPresetList));

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

function renderImportSummary(analysis) {
  const lines = [
    `候选请求: ${analysis.candidates.length}`,
    `推断账号来源: ${analysis.inferredAccountSource}`,
    `当前账号来源: ${analysis.accountSource}`,
    `推断登录模式: ${analysis.inferredAuthMode}`,
    `当前登录模式: ${analysis.authMode}`,
    `任务组数量: ${analysis.groups.length}`,
  ];
  if (Array.isArray(analysis.warnings) && analysis.warnings.length > 0) {
    lines.push("");
    lines.push("警告:");
    analysis.warnings.forEach((warning, index) => {
      lines.push(`${index + 1}. ${warning}`);
    });
  }

  setStatus(elements.importSummary, lines.join("\n"), analysis.warnings.length > 0 ? "warn" : "");
}

async function analyzeImport() {
  const inputPath = elements.importInputPath.value.trim();
  if (!inputPath) {
    setStatus(elements.importSummary, "请先选择导入文件。", "error");
    return;
  }

  setStatus(elements.importSummary, "正在分析导入文件...");
  try {
    const analysis = await desktopApi.analyzeImport({
      sourceType: elements.importSourceType.value,
      inputPath,
      accountSource: elements.importAccountSource.value,
      accountFields: toAccountFieldsArray(elements.importAccountFields.value),
      authMode: elements.importAuthMode.value,
      loginCandidateId: elements.importLoginCandidate.value || null,
      nonceCandidateId: elements.importNonceCandidate.value || null,
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
    renderImportSummary(analysis);
  } catch (error) {
    state.importAnalysis = null;
    elements.importGroupList.innerHTML = "";
    setStatus(elements.importSummary, `分析失败: ${error.message || String(error)}`, "error");
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
      `生成成功\n输出目录: ${result.outputDir}\n文件数: ${result.files.length}`
    );
  } catch (error) {
    setStatus(elements.manualStatus, `生成失败: ${error.message || String(error)}`, "error");
  }
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
  } catch (error) {
    setStatus(elements.importSummary, `生成失败: ${error.message || String(error)}`, "error");
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
  await refreshManualPresets();

  elements.importAccountSource.value = "accounts";
  syncImportAuthModes("request");
  fillSelect(elements.importLoginCandidate, [{ id: "", name: "(自动选择)" }], "");
  fillSelect(elements.importNonceCandidate, [{ id: "", name: "(自动选择)" }], "");
  setStatus(elements.importSummary, "请先选择导入文件，再点击“分析抓包”。");
}

elements.tabManual.addEventListener("click", () => toggleTabs("manual"));
elements.tabImport.addEventListener("click", () => toggleTabs("import"));

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
  }
});

elements.manualGenerate.addEventListener("click", generateManual);
elements.importAnalyze.addEventListener("click", analyzeImport);
elements.importGenerate.addEventListener("click", generateImport);

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

bootstrap().catch((error) => {
  setStatus(
    elements.manualStatus,
    `初始化失败: ${error.message || String(error)}`,
    "error"
  );
});
