const fs = require("fs");
const path = require("path");

function getSettingsPath(rootDir) {
  return path.join(path.resolve(String(rootDir || "")), "_settings.json");
}

function getDefaultSettings() {
  return {
    ai: {
      provider: "disabled",
      endpoint: "",
      model: "",
      apiKey: "",
    },
    captcha: {
      provider: "manual",
      endpoint: "",
      apiKey: "",
    },
    browser: {
      preferredProfile: "",
      reuseSession: true,
      automationMode: "local-first",
    },
    proxy: {
      defaultProxy: "",
      useSystemProxy: true,
    },
    rpc: {
      evmRpcUrl: "",
      solanaRpcUrl: "",
    },
    wallet: {
      mode: "hybrid",
      evmProvider: "metamask",
      solanaProvider: "phantom",
    },
  };
}

function normalizeSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  const defaults = getDefaultSettings();
  return {
    ai: {
      provider: String(source.ai && source.ai.provider || defaults.ai.provider),
      endpoint: String(source.ai && source.ai.endpoint || defaults.ai.endpoint),
      model: String(source.ai && source.ai.model || defaults.ai.model),
      apiKey: String(source.ai && source.ai.apiKey || defaults.ai.apiKey),
    },
    captcha: {
      provider: String(source.captcha && source.captcha.provider || defaults.captcha.provider),
      endpoint: String(source.captcha && source.captcha.endpoint || defaults.captcha.endpoint),
      apiKey: String(source.captcha && source.captcha.apiKey || defaults.captcha.apiKey),
    },
    browser: {
      preferredProfile: String(source.browser && source.browser.preferredProfile || defaults.browser.preferredProfile),
      reuseSession: !source.browser || source.browser.reuseSession !== false,
      automationMode: String(source.browser && source.browser.automationMode || defaults.browser.automationMode),
    },
    proxy: {
      defaultProxy: String(source.proxy && source.proxy.defaultProxy || defaults.proxy.defaultProxy),
      useSystemProxy: !source.proxy || source.proxy.useSystemProxy !== false,
    },
    rpc: {
      evmRpcUrl: String(source.rpc && source.rpc.evmRpcUrl || defaults.rpc.evmRpcUrl),
      solanaRpcUrl: String(source.rpc && source.rpc.solanaRpcUrl || defaults.rpc.solanaRpcUrl),
    },
    wallet: {
      mode: String(source.wallet && source.wallet.mode || defaults.wallet.mode),
      evmProvider: String(source.wallet && source.wallet.evmProvider || defaults.wallet.evmProvider),
      solanaProvider: String(source.wallet && source.wallet.solanaProvider || defaults.wallet.solanaProvider),
    },
  };
}

function loadSettings(rootDir) {
  const settingsPath = getSettingsPath(rootDir);
  if (!fs.existsSync(settingsPath)) {
    return normalizeSettings();
  }

  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(settingsPath, "utf8")));
  } catch {
    return normalizeSettings();
  }
}

function saveSettings(rootDir, input) {
  const settingsPath = getSettingsPath(rootDir);
  const settings = normalizeSettings(input);
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return settings;
}

module.exports = {
  getDefaultSettings,
  normalizeSettings,
  loadSettings,
  saveSettings,
};
