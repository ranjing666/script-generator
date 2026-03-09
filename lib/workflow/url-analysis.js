const { URL } = require("url");
const { createAnalysisModel, normalizeWorkflow, slugify } = require("./model");
const { selectAdapter } = require("./adapters");
const { getDefaultSettings, normalizeSettings } = require("./settings");

function safeUrl(input) {
  try {
    return new URL(String(input || "").trim());
  } catch {
    return null;
  }
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function collectAll(regex, text, mapper) {
  const results = [];
  let matched = regex.exec(text);
  while (matched) {
    const value = mapper ? mapper(matched) : matched[0];
    if (value) {
      results.push(value);
    }
    matched = regex.exec(text);
  }
  return results;
}

function unique(list) {
  return [...new Set((list || []).filter(Boolean))];
}

function truncate(text, max = 160) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 1)}...`;
}

function extractPageTitle(html, fallback = "") {
  const matched = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return truncate(stripTags(matched ? matched[1] : fallback || ""));
}

function extractHeadings(html) {
  return unique(
    collectAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, String(html || ""), (matched) => truncate(stripTags(matched[1])))
  ).slice(0, 8);
}

function extractButtons(html) {
  const buttonText = collectAll(/<(button|a)[^>]*>([\s\S]*?)<\/\1>/gi, String(html || ""), (matched) => truncate(stripTags(matched[2])));
  const inputValues = collectAll(/<input[^>]+type=["']?(submit|button)["']?[^>]+value=["']([^"']+)["']/gi, String(html || ""), (matched) => truncate(stripTags(matched[2])));
  return unique([...buttonText, ...inputValues].filter((item) => item && item.length >= 2)).slice(0, 12);
}

function extractForms(html) {
  return collectAll(/<form([^>]*)>([\s\S]*?)<\/form>/gi, String(html || ""), (matched) => {
    const attrs = matched[1] || "";
    const inner = matched[2] || "";
    const nameMatch = attrs.match(/\b(id|name|data-testid)=["']([^"']+)["']/i);
    const fieldNames = collectAll(/<(input|textarea|select)[^>]+(?:name|placeholder|id)=["']([^"']+)["']/gi, inner, (fieldMatch) => stripTags(fieldMatch[2]));
    const label = nameMatch ? nameMatch[2] : fieldNames.join(", ");
    return truncate(label || stripTags(inner), 120);
  }).filter(Boolean).slice(0, 8);
}

function extractMetaKeywords(html) {
  const keywords = collectAll(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/gi, String(html || ""), (matched) =>
    matched[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  ).flat();
  return unique(keywords).slice(0, 12);
}

function buildArtifactFromHtml(sourceUrl, html, options = {}) {
  const title = extractPageTitle(html, options.title);
  const buttons = extractButtons(html);
  const forms = extractForms(html);
  const headings = extractHeadings(html);
  const keywords = extractMetaKeywords(html);
  const text = stripTags(html);

  return {
    sourceUrl,
    host: options.urlInfo ? options.urlInfo.host : "",
    pathname: options.urlInfo ? options.urlInfo.pathname : "",
    title,
    headings,
    buttons,
    forms,
    keywords,
    text,
    html: String(html || ""),
    fetchMode: options.fetchMode || "provided-html",
    fetchedAt: new Date().toISOString(),
    htmlSnapshotPath: "",
    analysisSummaryPath: "",
    networkLogPath: "",
    tracePath: "",
  };
}

async function fetchWithGlobalFetch(url) {
  if (typeof fetch !== "function") {
    throw new Error("当前环境没有全局 fetch。");
  }

  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "FengToolbox Workflow Studio",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  return {
    ok: response.ok,
    status: response.status,
    html: await response.text(),
  };
}

async function captureWithPlaywright(url) {
  const playwright = require("playwright");
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(1200);
    const html = await page.content();
    const title = await page.title();
    await browser.close();
    return {
      html,
      title,
      fetchMode: "playwright",
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

function hasPlaywrightSupport() {
  try {
    require.resolve("playwright");
    return true;
  } catch {
    return false;
  }
}

async function captureUrlArtifact(sourceUrl, settings, options = {}) {
  const urlInfo = safeUrl(sourceUrl);
  if (!urlInfo) {
    throw new Error("请输入有效的官网 URL。");
  }

  if (hasText(options.html)) {
    return buildArtifactFromHtml(sourceUrl, options.html, {
      title: options.title,
      urlInfo,
      fetchMode: "provided-html",
    });
  }

  const warnings = [];
  let fetched = null;
  const shouldTryPlaywright = options.preferPlaywright !== false;

  if (shouldTryPlaywright && !hasPlaywrightSupport()) {
    warnings.push("本地没有安装 Playwright，已回退到静态抓取。");
  }

  if (shouldTryPlaywright && hasPlaywrightSupport()) {
    try {
      fetched = await captureWithPlaywright(sourceUrl);
    } catch (error) {
      warnings.push(`Playwright 采集失败，已回退到静态抓取: ${error.message || String(error)}`);
    }
  }

  if (!fetched) {
    try {
      const response = await fetchWithGlobalFetch(sourceUrl);
      if (!response.ok) {
        warnings.push(`静态抓取返回状态码 ${response.status}。`);
      }
      fetched = {
        html: response.html,
        fetchMode: "http-fetch",
      };
    } catch (error) {
      throw new Error(`页面抓取失败: ${error.message || String(error)}`);
    }
  }

  const artifact = buildArtifactFromHtml(sourceUrl, fetched.html, {
    title: fetched.title,
    urlInfo,
    fetchMode: fetched.fetchMode,
  });
  artifact.warnings = warnings;
  artifact.aiProvider = settings.ai.provider;
  return artifact;
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function buildSignals(artifact) {
  const combined = [
    artifact.title,
    ...(artifact.headings || []),
    ...(artifact.buttons || []),
    ...(artifact.forms || []),
    ...(artifact.keywords || []),
    artifact.text,
  ]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();

  const signals = {
    hasCaptcha: /(captcha|recaptcha|hcaptcha|turnstile)/.test(combined),
    hasWallet: /(connect wallet|wallet connect|metamask|rainbow|coinbase wallet|sign in with ethereum|wallet)/.test(combined),
    hasSolana: /(solana|phantom|backpack|wallet-adapter)/.test(combined),
    hasUpload: /(upload|dataset|model|huggingface|submit link|submit url|content)/.test(combined),
    hasClaim: /(claim|reward|rewards|quest|quests|mission|missions|badge)/.test(combined),
    hasQuestWords: /(quest|quests|mission|missions|task center|campaign)/.test(combined),
    hasFaucet: /(faucet|test token|testnet token|drip)/.test(combined),
    hasLogin: /(login|log in|sign in|email|password|passcode|otp)/.test(combined),
    hasDynamicEncryption: /(crypto\.subtle|signature|signmessage|sign message|x-sign|encrypted|cipher|nonce)/.test(combined),
    hasAddressField: /(wallet address|address)/.test(combined),
    hasAnyInteractive: (artifact.buttons || []).length > 0 || (artifact.forms || []).length > 0,
  };

  return signals;
}

function buildConfidence(artifact, signals, warnings, settings) {
  let score = 35;
  const notes = [];
  const signalList = [];

  if (artifact.fetchMode === "playwright") {
    score += 15;
    notes.push("已用浏览器模式抓到动态页面内容。");
  } else if (artifact.fetchMode === "http-fetch") {
    score += 8;
    notes.push("当前是静态抓取，复杂前端站点可能不完整。");
  }

  if (artifact.title) {
    score += 5;
  }
  if ((artifact.buttons || []).length > 0) {
    score += Math.min(12, artifact.buttons.length * 2);
  }
  if ((artifact.forms || []).length > 0) {
    score += Math.min(12, artifact.forms.length * 3);
  }

  Object.entries(signals).forEach(([key, value]) => {
    if (value) {
      signalList.push(key);
    }
  });
  score += Math.min(18, signalList.length * 4);

  if (signals.hasCaptcha) {
    score -= 6;
    notes.push("站点带验证码，自动化会落到人工兜底。");
  }
  if (signals.hasDynamicEncryption) {
    score -= 8;
    notes.push("页面疑似带前端签名或动态参数。");
  }
  if (warnings.length > 0) {
    score -= Math.min(18, warnings.length * 4);
  }
  if (settings.ai.provider && settings.ai.provider !== "disabled") {
    notes.push(`已配置 AI 提供方 ${settings.ai.provider}，后续可扩展为更强的解释层。`);
  } else {
    notes.push("当前 AI 层先按本地启发式分析执行。");
  }

  const bounded = Math.max(10, Math.min(95, score));
  return {
    score: bounded,
    label: bounded >= 80 ? "高" : bounded >= 55 ? "中" : "低",
    notes,
  };
}

function buildWarnings(artifact, signals) {
  const warnings = Array.isArray(artifact.warnings) ? [...artifact.warnings] : [];

  if (!signals.hasAnyInteractive) {
    warnings.push("页面里没有稳定表单或按钮结构，可能只是营销首页。");
  }
  if (signals.hasCaptcha) {
    warnings.push("检测到验证码，应用内运行会优先调用服务，失败后切人工兜底。");
  }
  if (signals.hasDynamicEncryption) {
    warnings.push("检测到前端签名/动态参数线索，生成后建议先抓一次真实请求复核。");
  }
  if (signals.hasWallet && signals.hasSolana) {
    warnings.push("同时检测到钱包和 Solana 线索，说明站点身份链路可能比较复杂。");
  }

  return unique(warnings);
}

function createAnalysisContext(sourceUrl, artifact, settings) {
  const signals = buildSignals(artifact);
  const warnings = buildWarnings(artifact, signals);
  const confidence = buildConfidence(artifact, signals, warnings, settings);
  const urlInfo = safeUrl(sourceUrl);

  return {
    sourceUrl,
    urlInfo: urlInfo || { host: "", pathname: "/" },
    artifact,
    settings,
    signals,
    analysis: createAnalysisModel({
      sourceType: "url",
      sourceUrl,
      title: artifact.title,
      fetchMode: artifact.fetchMode,
      fetchedAt: artifact.fetchedAt,
      warnings,
      signals: Object.entries(signals)
        .filter(([, value]) => value)
        .map(([key]) => key),
      confidence,
    }),
  };
}

function finalizeAnalysisResult(context, selection, workflow, diagnostics) {
  const picked = selection.picked;
  const reviewReasons = Array.isArray(workflow.review && workflow.review.reasons)
    ? workflow.review.reasons
    : [];
  const adapterWarnings = picked && typeof picked.adapter.diagnose === "function"
    ? picked.adapter.diagnose(context) || []
    : [];

  workflow.analysis = createAnalysisModel({
    ...workflow.analysis,
    adapterCandidates: selection.ranked.map((item) => ({
      id: item.id,
      label: item.label,
      score: item.score,
    })),
  });
  workflow.review.reasons = unique([...reviewReasons, ...adapterWarnings]);
  workflow.review.requiresHumanReview = workflow.review.requiresHumanReview || adapterWarnings.length > 0;
  workflow.diagnostics = diagnostics;

  return {
    workflow: normalizeWorkflow(workflow),
    analysis: workflow.analysis,
    adapter: workflow.adapter,
    artifacts: workflow.artifacts,
    review: workflow.review,
    sourceArtifact: context.artifact,
  };
}

async function analyzeUrlToWorkflow(options = {}) {
  const sourceUrl = String(options.url || "").trim();
  if (!sourceUrl) {
    throw new Error("请输入官网 URL。");
  }

  const settings = normalizeSettings(options.settings || getDefaultSettings());
  const artifact = await captureUrlArtifact(sourceUrl, settings, {
    html: options.html,
    title: options.title,
    preferPlaywright: options.preferPlaywright,
  });
  const context = createAnalysisContext(sourceUrl, artifact, settings);
  const selection = selectAdapter(context);
  const picked = selection.picked;

  if (!picked) {
    throw new Error("没有找到可用的 URL 适配器。");
  }

  const compiled = picked.adapter.compile({
    ...context,
    analysis: {
      ...context.analysis,
      adapterCandidates: selection.ranked.map((item) => ({
        id: item.id,
        label: item.label,
        score: item.score,
      })),
    },
  });
  const workflow = normalizeWorkflow(compiled);

  return finalizeAnalysisResult(context, selection, workflow, workflow.diagnostics || {
    generatedAt: new Date().toISOString(),
    items: [],
    summary: {
      blockingCount: 0,
      warningCount: 0,
    },
  });
}

function deriveProjectNameFromUrl(url) {
  const parsed = safeUrl(url);
  return parsed ? slugify(parsed.host.replace(/^www\./, "")) || "url-workflow" : "url-workflow";
}

module.exports = {
  analyzeUrlToWorkflow,
  captureUrlArtifact,
  buildSignals,
  deriveProjectNameFromUrl,
};
