const fs = require("fs");
const path = require("path");
const { normalizeSettings } = require("./workflow/settings");

const MANUAL_ATTENTION_TASK_TYPES = [
  "browserAction",
  "browserExtract",
  "captchaSolve",
  "walletConnect",
  "solanaSign",
  "solanaTransfer",
  "contentUpload",
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function unique(list) {
  return [...new Set((list || []).filter(Boolean))];
}

function buildAccountsConfig({ accountSource, accountFields }) {
  if (accountSource === "privateKeys") {
    return {
      source: "privateKeys",
      file: "data/privateKeys.txt",
    };
  }

  if (accountSource === "tokens") {
    return {
      source: "tokens",
      file: "data/tokens.txt",
    };
  }

  return {
    source: "accounts",
    file: "data/accounts.txt",
    delimiter: "|",
    fields: accountFields,
  };
}

function taskNeedsRpc(task) {
  return ["contractWrite", "deployContract", "nativeTransfer"].includes(task.type);
}

function collectStrings(input, bucket) {
  if (typeof input === "string") {
    bucket.push(input);
    return;
  }

  if (Array.isArray(input)) {
    input.forEach((item) => collectStrings(item, bucket));
    return;
  }

  if (input && typeof input === "object") {
    Object.values(input).forEach((item) => collectStrings(item, bucket));
  }
}

function extractEnvKeysFromConfig(input) {
  const strings = [];
  collectStrings(input, strings);
  const envKeys = new Set();

  strings.forEach((text) => {
    const regex = /{{\s*env\.([a-zA-Z0-9_]+)\s*}}/g;
    let matched = regex.exec(text);
    while (matched) {
      envKeys.add(matched[1]);
      matched = regex.exec(text);
    }
  });

  return [...envKeys].sort();
}

function buildRequestPolicyConfig(options) {
  const policy = options.requestPolicy || {};
  const retryStatusCodes = Array.isArray(policy.retryStatusCodes)
    ? policy.retryStatusCodes
    : [408, 425, 429, 500, 502, 503, 504];

  return {
    maxAttempts: Number(policy.maxAttempts || 2),
    baseDelayMs: Number(policy.baseDelayMs || 1500),
    maxDelayMs: Number(policy.maxDelayMs || 30000),
    retryStatusCodes: retryStatusCodes.map((code) => Number(code)).filter(Number.isFinite),
    respectRetryAfter: policy.respectRetryAfter !== false,
  };
}

function buildRuntimeConfig(options, tasks) {
  const runtime = options.runtime || {};
  const analysis = options.analysis || {};
  const adapter = options.adapter || {};
  const review = options.review || {};
  const settings = normalizeSettings(options.settings || {});
  const taskTypes = unique((tasks || []).map((task) => task && task.type));
  const manualAttentionTaskTypes = taskTypes.filter((type) => MANUAL_ATTENTION_TASK_TYPES.includes(type));
  const requiresDesktopRuntime = manualAttentionTaskTypes.length > 0;
  const requiresHumanReview = Boolean(review.requiresHumanReview) || requiresDesktopRuntime;
  const sourceArtifacts = options.sourceArtifacts && typeof options.sourceArtifacts === "object"
    ? options.sourceArtifacts
    : { available: false, files: [] };

  return {
    executionMode: runtime.executionMode || "generated-project",
    identityPriority: Array.isArray(runtime.identityPriority) && runtime.identityPriority.length > 0
      ? runtime.identityPriority
      : ["browserSession", "localAccount"],
    browser: {
      reuseSession: !runtime.browser || runtime.browser.reuseSession !== false,
      preferredProfile: runtime.browser && runtime.browser.preferredProfile ? runtime.browser.preferredProfile : "",
      automationMode: runtime.browser && runtime.browser.automationMode ? runtime.browser.automationMode : "local-first",
    },
    captcha: {
      provider: runtime.captcha && runtime.captcha.provider ? runtime.captcha.provider : "manual",
      allowManualFallback: !runtime.captcha || runtime.captcha.allowManualFallback !== false,
    },
    services: {
      ai: {
        provider: settings.ai.provider,
        endpoint: settings.ai.endpoint,
        model: settings.ai.model,
        apiKeyConfigured: Boolean(settings.ai.apiKey),
      },
      captcha: {
        provider: settings.captcha.provider,
        endpoint: settings.captcha.endpoint,
        apiKeyConfigured: Boolean(settings.captcha.apiKey),
      },
      proxy: {
        defaultProxyConfigured: Boolean(settings.proxy.defaultProxy),
        useSystemProxy: settings.proxy.useSystemProxy !== false,
      },
      rpc: {
        evmConfigured: Boolean(settings.rpc.evmRpcUrl),
        solanaConfigured: Boolean(settings.rpc.solanaRpcUrl),
      },
      wallet: {
        mode: settings.wallet.mode,
        evmProvider: settings.wallet.evmProvider,
        solanaProvider: settings.wallet.solanaProvider,
      },
    },
    adapter: {
      id: adapter.id || "manual",
      label: adapter.label || "手动流程",
      confidence: Number(adapter.confidence || 0),
    },
    analysis: {
      sourceType: analysis.sourceType || "manual",
      sourceUrl: analysis.sourceUrl || "",
      confidence: analysis.confidence || { score: 0, label: "未分析", notes: [] },
      warnings: Array.isArray(analysis.warnings) ? analysis.warnings : [],
    },
    review: {
      requiresHumanReview: Boolean(review.requiresHumanReview),
      reasons: Array.isArray(review.reasons) ? review.reasons : [],
    },
    support: {
      manualAttentionTaskTypes,
      requiresDesktopRuntime,
      requiresHumanReview,
      recommendedMode: requiresDesktopRuntime
        ? "desktop-app"
        : requiresHumanReview
        ? "desktop-app-first"
        : "standalone-or-desktop",
      analysisWarnings: Array.isArray(analysis.warnings) ? analysis.warnings : [],
      reviewReasons: Array.isArray(review.reasons) ? review.reasons : [],
    },
    sourceArtifacts: {
      available: Boolean(sourceArtifacts.available),
      files: Array.isArray(sourceArtifacts.files) ? sourceArtifacts.files : [],
    },
  };
}

function buildProjectConfig(options) {
  const selectedPresets = options.selectedPresets || [];
  const tasks =
    options.customTasks ||
    selectedPresets.map((preset) =>
      preset.build({
        authMode: options.authMode,
        accountSource: options.accountSource,
        accountFields: options.accountFields,
      })
    );
  const requiresRpc =
    options.accountSource === "privateKeys" &&
    tasks.some((task) => taskNeedsRpc(task));

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      generator: "script-generator",
      selectedPresets: selectedPresets.map((preset) => preset.id),
      ...(options.meta || {}),
    },
    project: {
      name: options.projectName,
      concurrency: options.concurrency,
      repeat: options.repeat,
      intervalMinutes: options.intervalMinutes,
      useProxy: options.useProxy,
      requestPolicy: buildRequestPolicyConfig(options),
    },
    accounts: buildAccountsConfig(options),
    network: requiresRpc
      ? {
          rpcUrlEnv: "RPC_URL",
          chainId: 11155111,
        }
      : null,
    runtime: buildRuntimeConfig(options, tasks),
    auth: options.auth,
    tasks,
  };
}

function buildEnvExample(projectConfig) {
  const lines = [
    "# 已自动生成 .env，直接填写即可；.env.example 只是备份模板",
  ];

  if (projectConfig.network) {
    lines.push("RPC_URL=https://your-rpc-url");
  }

  if (
    projectConfig.tasks.some((task) => {
      const text = JSON.stringify(task);
      return text.includes("CAPTCHA_TOKEN");
    })
  ) {
    lines.push("CAPTCHA_TOKEN=");
  }

  const extractedEnvKeys = extractEnvKeysFromConfig(projectConfig);
  extractedEnvKeys.forEach((envKey) => {
    if (!lines.some((line) => line.startsWith(`${envKey}=`))) {
      lines.push(`${envKey}=`);
    }
  });

  if (lines.length === 1) {
    lines.push("# 当前模板没有强制依赖的环境变量");
  }

  return `${lines.join("\n")}\n`;
}

function buildAccountGuide(projectConfig) {
  if (projectConfig.accounts.source === "privateKeys") {
    return [
      "- 打开 `data/privateKeys.txt`。",
      "- 每行填一个钱包私钥，建议保留 `0x` 前缀。",
      "- 这个文件非常敏感，不要发给别人。",
    ];
  }

  if (projectConfig.accounts.source === "tokens") {
    return [
      "- 打开 `data/tokens.txt`。",
      "- 每行填一个 token，不要带多余空格。",
      "- 如果网站 token 会过期，过期后要重新抓包或重新登录获取。",
    ];
  }

  return [
    `- 打开 \`${projectConfig.accounts.file}\`。`,
    `- 每行按 \`${projectConfig.accounts.fields.join("|")}\` 的顺序填写。`,
    "- 不要删掉分隔符 `|`，也不要多写空格。",
  ];
}

function buildEnvGuide(projectConfig) {
  const envKeys = extractEnvKeysFromConfig(projectConfig);
  const lines = [
    "- `.env` 已经自动生成，不用你再复制模板。",
  ];

  if (projectConfig.network) {
    lines.push("- 这个项目需要填写 `RPC_URL=`，否则链上任务跑不起来。");
  }

  if (envKeys.length > 0) {
    lines.push(`- 除了默认项外，还预留了这些环境变量：${envKeys.map((key) => `\`${key}\``).join("、")}。`);
  } else if (!projectConfig.network) {
    lines.push("- 如果 `.env` 里几乎是空的，说明这个模板暂时没有强制环境变量。");
  }

  return lines;
}

function buildRuntimeSupportGuide(projectConfig) {
  const runtime = projectConfig.runtime || {};
  const support = runtime.support || {};
  const lines = [];

  if (support.requiresDesktopRuntime) {
    lines.push("- 当前项目包含浏览器、钱包、验证码或内容上传类步骤，优先在风的工具箱里点“应用内运行”。");
  } else if (support.requiresHumanReview) {
    lines.push("- 当前草案建议先在桌面端预览和复核，再决定是否直接双击启动。");
  } else {
    lines.push("- 当前流程更偏向普通请求/链上模板，独立导出的 Node 项目可以直接跑。");
  }

  if (Array.isArray(support.manualAttentionTaskTypes) && support.manualAttentionTaskTypes.length > 0) {
    lines.push(`- 需要重点留意的步骤类型：${support.manualAttentionTaskTypes.map((item) => `\`${item}\``).join("、")}。`);
  }

  if (runtime.sourceArtifacts && runtime.sourceArtifacts.available) {
    lines.push("- 已附带来源材料到 `artifacts/` 目录，可以对着快照和摘要补真实接口。");
  }

  return lines;
}

function getRequestFromFileDataFiles(projectConfig) {
  const files = {};

  (projectConfig.tasks || []).forEach((task) => {
    if (!task || task.type !== "requestFromFile") {
      return;
    }

    const filePath =
      typeof task.dataFile === "string" && task.dataFile.trim()
        ? task.dataFile.trim()
        : "data/requestRows.txt";

    if (files[filePath]) {
      return;
    }

    const fields =
      Array.isArray(task.fields) && task.fields.length > 0
        ? task.fields.map((field) => String(field || "").trim()).filter(Boolean)
        : ["value"];
    const header = fields.join("|");
    const sample = fields
      .map((field) => `your_${String(field || "value").replace(/[^a-zA-Z0-9_]+/g, "_")}`)
      .join("|");

    files[filePath] = `# 字段顺序: ${header}\n${sample}\n`;
  });

  return files;
}

function buildTaskDataGuides(projectConfig) {
  const rowsTaskFiles = [
    ...new Set(
      (projectConfig.tasks || [])
        .filter((task) => task && task.type === "requestFromFile")
        .map((task) =>
          typeof task.dataFile === "string" && task.dataFile.trim()
            ? task.dataFile.trim()
            : "data/requestRows.txt"
        )
    ),
  ];

  return rowsTaskFiles.map(
    (filePath) => `- \`${filePath}\`: 逐行填写任务参数，默认用 \`|\` 分隔。`
  );
}

function buildStarterGuide(projectConfig) {
  const taskLines = (projectConfig.tasks || []).length > 0
    ? projectConfig.tasks
        .map((task, index) => `${index + 1}. ${task.name}（${task.type}）`)
        .join("\n")
    : "1. 当前没有任务，请检查生成配置。";
  const taskDataGuides = buildTaskDataGuides(projectConfig);
  const taskDataGuideText =
    taskDataGuides.length > 0 ? `\n${taskDataGuides.join("\n")}` : "";

  return `# 先看这里（零基础版）

这个目录已经是一个可运行项目，你不用再自己复制 \`.env.example\`。
如果你完全不会跑脚本，先双击 \`0-双击-运行前检查.bat\`，它会直接告诉你还缺什么。

## 直接按顺序做
1. 先双击 \`0-双击-运行前检查.bat\`，看报告里缺什么
2. 双击 \`1-双击-安装依赖.bat\`
3. 打开 \`.env\`，把里面的空白值改成你自己的真实值
4. 打开 \`${projectConfig.accounts.file}\`，按示例格式填账号
5. 最后双击 \`2-双击-启动脚本.bat\`

提示：
- 如果你懒得分开操作，直接双击 \`2-双击-启动脚本.bat\` 也行，它会自动补装依赖并先做自检。
- 每次不知道哪里没填好，就再双击一次 \`0-双击-运行前检查.bat\`。

## 先填哪里
${buildEnvGuide(projectConfig).join("\n")}
${buildAccountGuide(projectConfig).join("\n")}
- \`project.config.json\` 先不要乱改。只有你确认接口地址、字段路径、任务顺序不对时，再去改它。
- \`runtime.config.json\` 记录浏览器会话、验证码和人工兜底策略，通常不用一开始就改。

## 运行方式建议
${buildRuntimeSupportGuide(projectConfig).join("\n")}

## 这个项目会做什么
${taskLines}

## 常见情况
- 如果双击安装脚本后提示没找到 Node.js：先安装 Node.js LTS，再重新双击。
- 如果启动后提示“没有加载到账号数据”：说明 \`${projectConfig.accounts.file}\` 还没填好。
- 如果启动后提示“缺少 RPC_URL”：说明 \`.env\` 里的 \`RPC_URL=\` 还没填。
- 如果接口报 \`429\`：先把并发调低，再晚一点重试。
- 如果你看不懂控制台：先打开根目录里的 \`运行前检查报告.txt\` 或 \`logs/last-error.txt\`。

## 你会看到的关键文件
- \`0-双击-运行前检查.bat\`：不会跑就先双击这个。
- \`1-双击-安装依赖.bat\`：首次运行先双击这个。
- \`2-双击-启动脚本.bat\`：会自动自检，然后启动项目。
- \`doctor.js\`：运行前检查脚本，通常不用手改。
- \`.env\`：环境变量文件。
- \`${projectConfig.accounts.file}\`：账号文件。
- \`project.config.json\`：任务积木和请求配置。${taskDataGuideText}
- \`artifacts/source-material.json\`：来源材料、分析结果和导出时的运行建议。
- \`运行前检查报告.txt\`：运行前缺什么，这里会直接写明白。
- \`logs/last-error.txt\`：最近一次失败的详细报错。
- \`README.md\`：更完整的说明。
`;
}

function buildCheckHelperScript() {
  return `@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 没有找到 Node.js。
  echo 请先安装 Node.js LTS，然后再重新双击本文件。
  echo 下载地址: https://nodejs.org/
  pause
  exit /b 1
)

echo 正在做运行前检查...
echo.
call node doctor.js
set "doctorExit=%errorlevel%"
echo.
if exist "运行前检查报告.txt" (
  echo 已生成检查报告: 运行前检查报告.txt
)
if "%doctorExit%"=="0" (
  echo 自检通过，现在可以直接双击 2-双击-启动脚本.bat
) else (
  echo 自检没有通过。
  echo 请先按报告把 .env 和 data 文件补齐，再重新双击本文件。
  if exist "运行前检查报告.txt" (
    start "" notepad "运行前检查报告.txt"
  )
)
pause
exit /b %doctorExit%
`;
}

function buildInstallHelperScript() {
  return `@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 没有找到 Node.js。
  echo 请先安装 Node.js LTS，然后再重新双击本文件。
  echo 下载地址: https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo 没有找到 npm。
  echo 请先安装完整版 Node.js LTS，然后再重新双击本文件。
  pause
  exit /b 1
)

echo [1/3] 正在安装依赖...
call npm install
if errorlevel 1 (
  echo.
  echo npm install 失败。
  echo 请检查网络、代理或 npm 镜像，然后再试一次。
  pause
  exit /b 1
)

if not exist ".env" (
  copy /Y ".env.example" ".env" >nul
)

echo [2/3] 已准备好 .env 文件
echo [3/3] 现在做一次运行前检查...
echo.
call node doctor.js
set "doctorExit=%errorlevel%"

echo.
if "%doctorExit%"=="0" (
  echo 安装和检查都完成了。
  echo 现在可以直接双击 2-双击-启动脚本.bat
) else (
  echo 依赖安装已经完成，但运行资料还没填完整。
  echo 这通常不是安装失败，而是 .env 或 data 文件还没填好。
  echo 请先看 运行前检查报告.txt，改完后再双击 2-双击-启动脚本.bat
)
pause
`;
}

function buildStartHelperScript() {
  return `@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 没有找到 Node.js。
  echo 请先安装 Node.js LTS，然后再重新双击本文件。
  echo 下载地址: https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  where npm >nul 2>nul
  if errorlevel 1 (
    echo 没有找到 npm，无法自动安装依赖。
    echo 请先安装完整版 Node.js LTS，然后再重新双击本文件。
    pause
    exit /b 1
  )

  echo 没检测到依赖，正在自动安装...
  call npm install
  if errorlevel 1 (
    echo.
    echo 自动安装依赖失败。
    echo 请先双击 1-双击-安装依赖.bat，或者检查网络后再试。
    pause
    exit /b 1
  )
)

if not exist ".env" (
  copy /Y ".env.example" ".env" >nul
)

echo.
echo [1/2] 正在做运行前检查...
call node doctor.js
if errorlevel 1 (
  echo.
  echo 运行前检查没有通过。
  echo 请先按 运行前检查报告.txt 把缺少的内容补齐，再重新双击本文件。
  pause
  exit /b 1
)

echo.
echo [2/2] 正在启动项目...
echo.
call node main.js
if errorlevel 1 (
  echo.
  echo 脚本运行失败。
  if exist "logs\\last-error.txt" (
    echo 详细报错已保存到 logs\\last-error.txt
  )
  echo 请先看窗口最后几行报错，再检查 .env、账号文件和 project.config.json。
  pause
  exit /b 1
)

echo.
echo 运行结束。
echo 如果这次没跑通，优先看 logs\\last-error.txt 和 运行前检查报告.txt
pause
`;
}

function buildDoctorSource() {
  return `const fs = require("fs");
const path = require("path");
const config = require("./project.config.json");
const runtime = require("./runtime.config.json");

function resolveProjectPath(relativePath) {
  return path.resolve(__dirname, relativePath);
}

function readText(relativePath) {
  const fullPath = resolveProjectPath(relativePath);
  if (!fs.existsSync(fullPath)) {
    return "";
  }

  return fs.readFileSync(fullPath, "utf8");
}

function readLines(relativePath) {
  return readText(relativePath)
    .split(/\\r?\\n/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !line.startsWith("#"));
}

function parseEnvFile(relativePath) {
  const env = {};
  readText(relativePath)
    .split(/\\r?\\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        return;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      env[key] = value;
    });

  return env;
}

function collectStrings(input, bucket) {
  if (typeof input === "string") {
    bucket.push(input);
    return;
  }

  if (Array.isArray(input)) {
    input.forEach((item) => collectStrings(item, bucket));
    return;
  }

  if (input && typeof input === "object") {
    Object.values(input).forEach((item) => collectStrings(item, bucket));
  }
}

function extractEnvKeysFromConfig(input) {
  const strings = [];
  const envKeys = new Set();
  collectStrings(input, strings);

  strings.forEach((text) => {
    const regex = /{{\\s*env\\.([a-zA-Z0-9_]+)\\s*}}/g;
    let matched = regex.exec(text);
    while (matched) {
      envKeys.add(matched[1]);
      matched = regex.exec(text);
    }
  });

  return [...envKeys];
}

function unique(list) {
  return [...new Set((list || []).filter(Boolean))];
}

function addIssue(bucket, title, detail) {
  bucket.push({ title, detail });
}

function isPlaceholderValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return (
    normalized.startsWith("your_") ||
    normalized.startsWith("0xyour_") ||
    normalized.includes("your_private_key") ||
    normalized.includes("your_bearer_token") ||
    normalized.includes("your_rpc") ||
    normalized.includes("replace_me") ||
    normalized === "changeme" ||
    normalized === "change_me"
  );
}

function stripHeaderLine(lines, fields, delimiter) {
  if (!Array.isArray(lines) || lines.length === 0 || !Array.isArray(fields) || fields.length === 0) {
    return lines;
  }

  const normalizedFields = fields.map((field) => String(field || "").trim().toLowerCase());
  const firstParts = String(lines[0] || "")
    .split(delimiter)
    .map((part) => String(part || "").trim().toLowerCase());
  const isHeader =
    firstParts.length >= normalizedFields.length &&
    normalizedFields.every((field, index) => firstParts[index] === field);

  return isHeader ? lines.slice(1) : lines;
}

function checkEnv(blockers) {
  if (!fs.existsSync(resolveProjectPath(".env"))) {
    addIssue(blockers, ".env 还没准备好", "先打开项目目录，确认 .env 文件存在；如果没有，先双击 1-双击-安装依赖.bat。");
    return;
  }

  const env = parseEnvFile(".env");
  const requiredKeys = unique([
    ...(config.network && config.network.rpcUrlEnv ? [config.network.rpcUrlEnv] : []),
    ...extractEnvKeysFromConfig(config),
  ]);

  requiredKeys.forEach((key) => {
    const value = env[key];
    if (!value) {
      addIssue(blockers, "缺少环境变量 " + key, "请打开 .env，把 " + key + "= 后面的值填上。");
      return;
    }

    if (isPlaceholderValue(value) || value.includes("your-rpc-url")) {
      addIssue(blockers, "环境变量 " + key + " 还是示例值", "请把 .env 里的 " + key + " 改成真实值，不要保留示例文字。");
    }
  });
}

function checkAccountFile(blockers) {
  const accountConfig = config.accounts || {};
  const filePath = accountConfig.file || "data/accounts.txt";
  const fullPath = resolveProjectPath(filePath);
  if (!fs.existsSync(fullPath)) {
    addIssue(blockers, "账号文件不存在", "缺少 " + filePath + "，请先检查项目目录是否完整。");
    return;
  }

  let lines = readLines(filePath);
  if (accountConfig.source === "accounts") {
    lines = stripHeaderLine(lines, accountConfig.fields || [], accountConfig.delimiter || "|");
  }

  if (lines.length === 0) {
    addIssue(blockers, "账号文件还没填", "请打开 " + filePath + "，按示例格式至少填写一行真实账号。");
    return;
  }

  if (accountConfig.source === "privateKeys") {
    lines.forEach((line, index) => {
      const normalized = String(line || "").trim();
      if (isPlaceholderValue(normalized)) {
        addIssue(blockers, "私钥文件还是示例值", "请把 " + filePath + " 第 " + (index + 1) + " 行改成真实私钥。");
      } else if (normalized.length < 20) {
        addIssue(blockers, "私钥看起来不完整", "请检查 " + filePath + " 第 " + (index + 1) + " 行是不是完整私钥。");
      }
    });
    return;
  }

  if (accountConfig.source === "tokens") {
    lines.forEach((line, index) => {
      if (isPlaceholderValue(line)) {
        addIssue(blockers, "Token 文件还是示例值", "请把 " + filePath + " 第 " + (index + 1) + " 行改成真实 token。");
      }
    });
    return;
  }

  const fields = Array.isArray(accountConfig.fields) ? accountConfig.fields : [];
  const delimiter = accountConfig.delimiter || "|";

  lines.forEach((line, index) => {
    const parts = String(line || "").split(delimiter).map((item) => String(item || "").trim());
    fields.forEach((field, fieldIndex) => {
      const value = parts[fieldIndex] || "";
      if (!value) {
        addIssue(blockers, "账号文件字段不完整", "请检查 " + filePath + " 第 " + (index + 1) + " 行，字段 " + field + " 还没填。");
      } else if (isPlaceholderValue(value)) {
        addIssue(blockers, "账号文件还是示例值", "请把 " + filePath + " 第 " + (index + 1) + " 行里的 " + field + " 改成真实值。");
      }
    });
  });
}

function rowLooksLikeExample(line, delimiter) {
  const parts = String(line || "")
    .split(delimiter)
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return false;
  }

  return parts.every((item) => isPlaceholderValue(item));
}

function getRequestRowFiles(tasks) {
  return unique(
    (tasks || [])
      .filter((task) => task && task.type === "requestFromFile")
      .map((task) => (typeof task.dataFile === "string" && task.dataFile.trim() ? task.dataFile.trim() : "data/requestRows.txt"))
  );
}

function checkRequestRowFiles(blockers) {
  const tasks = Array.isArray(config.tasks) ? config.tasks : [];
  const rowFiles = getRequestRowFiles(tasks);

  rowFiles.forEach((filePath) => {
    const relatedTask = tasks.find((task) => task && task.type === "requestFromFile" && (task.dataFile || "data/requestRows.txt") === filePath);
    const delimiter = relatedTask && relatedTask.delimiter ? String(relatedTask.delimiter) : "|";
    let lines = readLines(filePath);
    if (relatedTask && Array.isArray(relatedTask.fields) && relatedTask.fields.length > 0) {
      lines = stripHeaderLine(lines, relatedTask.fields, delimiter);
    }

    if (lines.length === 0) {
      addIssue(blockers, "批量提交数据还没填", "请打开 " + filePath + "，按示例格式填写至少一行真实任务参数。");
      return;
    }

    lines.forEach((line, index) => {
      if (rowLooksLikeExample(line, delimiter)) {
        addIssue(blockers, "批量提交文件还是示例值", "请把 " + filePath + " 第 " + (index + 1) + " 行改成真实任务参数。");
      }
    });
  });
}

function checkProxyFile(warnings) {
  const useProxy = Boolean(config.project && config.project.useProxy);
  if (!useProxy) {
    return;
  }

  const lines = readLines("data/proxies.txt");
  if (lines.length === 0) {
    addIssue(warnings, "你开启了代理，但代理文件是空的", "如果项目必须挂代理，请先填写 data/proxies.txt；如果不需要代理，就把 project.config.json 里的 useProxy 改成 false。");
  }
}

function checkRuntimeWarnings(warnings) {
  const support = runtime && runtime.support && typeof runtime.support === "object"
    ? runtime.support
    : {};
  const sourceArtifacts = runtime && runtime.sourceArtifacts && typeof runtime.sourceArtifacts === "object"
    ? runtime.sourceArtifacts
    : {};

  if (support.requiresHumanReview) {
    addIssue(
      warnings,
      "当前草案建议人工复核",
      "原因: " + ((Array.isArray(support.reviewReasons) && support.reviewReasons.length > 0 ? support.reviewReasons.join("；") : "自动分析认为仍需要人工确认。"))
    );
  }

  if (Array.isArray(support.manualAttentionTaskTypes) && support.manualAttentionTaskTypes.length > 0) {
    addIssue(
      warnings,
      "当前项目包含浏览器/钱包/验证码类步骤",
      "涉及步骤类型: " + support.manualAttentionTaskTypes.join("、") + "。独立 Node 项目默认不会完整驱动这些步骤，建议优先回风的工具箱里应用内运行。"
    );
  }

  if (Array.isArray(support.analysisWarnings) && support.analysisWarnings.length > 0) {
    addIssue(
      warnings,
      "来源分析给出了风险提示",
      support.analysisWarnings.join("；")
    );
  }

  if (sourceArtifacts.available) {
    addIssue(
      warnings,
      "已附带来源材料",
      "可以打开 artifacts/ 目录查看 source-material.json、URL 页面快照和分析摘要，对照补接口。"
    );
  }
}

function buildReportText(blockers, warnings) {
  const lines = [
    "风的工具箱 - 运行前检查报告",
    "",
    blockers.length === 0 ? "结论: 可以启动。" : "结论: 现在还不能启动，请先修完下面的问题。",
  ];

  if (blockers.length > 0) {
    lines.push("");
    lines.push("必须先解决:");
    blockers.forEach((item, index) => {
      lines.push((index + 1) + ". " + item.title);
      lines.push("   " + item.detail);
    });
  }

  if (warnings.length > 0) {
    lines.push("");
    lines.push("提醒:");
    warnings.forEach((item, index) => {
      lines.push((index + 1) + ". " + item.title);
      lines.push("   " + item.detail);
    });
  }

  lines.push("");
  lines.push("建议顺序:");
  lines.push("1. 先改 .env");
  lines.push("2. 再改 data/ 目录里的账号文件和任务数据文件");
  lines.push("3. 改完后重新双击 0-双击-运行前检查.bat");
  lines.push("4. 最后双击 2-双击-启动脚本.bat");
  if (runtime && runtime.support && runtime.support.requiresDesktopRuntime) {
    lines.push("5. 如果项目包含浏览器/钱包步骤，优先回风的工具箱里应用内运行");
  }

  return lines.join("\\n") + "\\n";
}

function printIssues(label, issues) {
  if (!Array.isArray(issues) || issues.length === 0) {
    return;
  }

  console.log(label);
  issues.forEach((item, index) => {
    console.log((index + 1) + ". " + item.title);
    console.log("   " + item.detail);
  });
  console.log("");
}

function main() {
  const blockers = [];
  const warnings = [];

  checkEnv(blockers);
  checkAccountFile(blockers);
  checkRequestRowFiles(blockers);
  checkProxyFile(warnings);
  checkRuntimeWarnings(warnings);

  const reportText = buildReportText(blockers, warnings);
  fs.writeFileSync(resolveProjectPath("运行前检查报告.txt"), reportText, "utf8");

  console.log("风的工具箱 - 运行前检查");
  console.log("");
  if (blockers.length === 0) {
    console.log("结论: 可以启动。");
    console.log("");
  } else {
    console.log("结论: 还不能启动，请先修下面这些问题。");
    console.log("");
  }

  printIssues("必须先解决:", blockers);
  printIssues("提醒:", warnings);
  console.log("检查报告已写入: 运行前检查报告.txt");

  if (blockers.length > 0) {
    process.exit(1);
  }
}

main();
`;
}

function buildDataFileContent(projectConfig, { accountSource, accountFields, useProxy }) {
  const files = {};

  if (accountSource === "privateKeys") {
    files["data/privateKeys.txt"] = "# 每行一个 EVM 私钥\n0xyour_private_key_1\n0xyour_private_key_2\n";
  } else if (accountSource === "tokens") {
    files["data/tokens.txt"] = "# 每行一个 token\nyour_bearer_token_1\nyour_bearer_token_2\n";
  } else {
    const header = accountFields.join("|");
    const sample = accountFields
      .map((field) => `your_${String(field || "value").replace(/[^a-zA-Z0-9_]+/g, "_")}`)
      .join("|");
    files["data/accounts.txt"] = `# 字段顺序: ${header}\n${sample}\n`;
  }

  files["data/proxies.txt"] = useProxy
    ? "# 每行一个代理\nhttp://user:pass@127.0.0.1:8080\n"
    : "";

  Object.assign(files, getRequestFromFileDataFiles(projectConfig));

  return files;
}

function buildGeneratedPackageJson(projectName) {
  const normalizedName = String(projectName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return JSON.stringify(
    {
      name: normalizedName || "generated-testnet-bot",
      version: "1.0.0",
      private: true,
      main: "main.js",
      scripts: {
        start: "node main.js",
        doctor: "node doctor.js",
      },
      dependencies: {
        axios: "^1.8.1",
        dotenv: "^16.4.7",
        ethers: "^6.13.5",
        "https-proxy-agent": "^7.0.6",
        solc: "^0.8.31",
      },
    },
    null,
    2
  );
}

function buildMainSource() {
  return `const fs = require("fs");
const path = require("path");
const config = require("./project.config.json");
const { runProject } = require("./lib/runner");

function buildHints(errorText) {
  const text = String(errorText || "");
  const hints = [];

  if (text.includes("没有加载到账号数据")) {
    hints.push("打开 data/ 目录，把账号文件改成真实值，不要保留 your_ 示例文字。");
  }
  if (text.includes("缺少 RPC_URL")) {
    hints.push("打开 .env，把 RPC_URL= 后面的值填成真实节点地址。");
  }
  if (text.includes("没从响应里提取到 token") || text.includes("账号缺少字段 token")) {
    hints.push("先检查登录接口和 token 提取路径，再确认账号文件或响应字段里确实有 token。");
  }
  if (text.includes("没有拿到待签名消息")) {
    hints.push("签名登录链路没对上，优先检查 noncePath、messageTemplate、messagePath。");
  }
  if (text.includes("没有读取到可提交的行数据")) {
    hints.push("打开 data/requestRows.txt 或对应数据文件，把示例值改成真实任务参数。");
  }
  if (text.includes("需要人工确认或浏览器运行支持")) {
    hints.push("这个项目包含浏览器/钱包/验证码步骤，建议优先回风的工具箱里应用内运行，或者手工扩展 Playwright / 钱包支持。");
  }
  if (text.includes("429")) {
    hints.push("接口限流了，先把并发调低，或者稍后再试。");
  }
  if (text.includes("当前账号没有 privateKey")) {
    hints.push("这个任务需要私钥账号，检查 accounts.source 和 data/privateKeys.txt。");
  }
  if (text.includes("需要人工确认或浏览器运行支持")) {
    hints.push("这一步属于 URL 分析草案，优先回到风的工具箱应用内运行，或者自己补浏览器/验证码能力。");
  }

  return [...new Set(hints)];
}

function writeLastError(errorText, hints) {
  const logsDir = path.resolve(__dirname, "logs");
  fs.mkdirSync(logsDir, { recursive: true });

  const lines = [
    "风的工具箱 - 最近一次运行失败",
    "",
    "时间: " + new Date().toLocaleString("zh-CN"),
    "",
    "原始报错:",
    String(errorText || ""),
  ];

  if (Array.isArray(hints) && hints.length > 0) {
    lines.push("");
    lines.push("先检查这几项:");
    hints.forEach((item, index) => {
      lines.push((index + 1) + ". " + item);
    });
  }

  fs.writeFileSync(path.join(logsDir, "last-error.txt"), lines.join("\\n") + "\\n", "utf8");
}

runProject(config).catch((error) => {
  const errorText = error && error.stack ? error.stack : String(error);
  const hints = buildHints(errorText);
  writeLastError(errorText, hints);

  console.error("运行失败。");
  console.error("");
  console.error(errorText);
  if (hints.length > 0) {
    console.error("");
    console.error("先检查这几项:");
    hints.forEach((item, index) => {
      console.error(String(index + 1) + ". " + item);
    });
  }
  console.error("");
  console.error("详细报错已写入 logs/last-error.txt");
  process.exit(1);
});
`;
}

function buildRunnerSource() {
  return `const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { ethers } = require("ethers");
const solc = require("solc");

require("dotenv").config();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readLines(filePath) {
  if (!filePath) {
    return [];
  }

  const fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    return [];
  }

  return fs
    .readFileSync(fullPath, "utf8")
    .split(/\\r?\\n/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !line.startsWith("#"));
}

function splitPath(expression) {
  if (!expression) {
    return [];
  }

  const tokens = [];
  let buffer = "";
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];

    if (char === ".") {
      if (buffer) {
        tokens.push(buffer);
        buffer = "";
      }
      index += 1;
      continue;
    }

    if (char === "[") {
      if (buffer) {
        tokens.push(buffer);
        buffer = "";
      }

      const end = expression.indexOf("]", index + 1);
      if (end === -1) {
        buffer += expression.slice(index);
        break;
      }

      const rawToken = expression.slice(index + 1, end).trim();
      const quoted = rawToken.match(/^['"](.*)['"]$/);
      const tokenValue = quoted ? quoted[1] : rawToken;
      if (/^\\d+$/.test(tokenValue)) {
        tokens.push(Number(tokenValue));
      } else if (tokenValue) {
        tokens.push(tokenValue);
      }

      index = end + 1;
      continue;
    }

    buffer += char;
    index += 1;
  }

  if (buffer) {
    tokens.push(buffer);
  }

  return tokens;
}

function getByPath(input, expression) {
  if (!expression) {
    return input;
  }

  return splitPath(expression).reduce((current, key) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    return current[key];
  }, input);
}

function setByPath(target, expression, value) {
  const keys = splitPath(expression);
  if (keys.length === 0) {
    return;
  }

  let current = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    const nextKey = keys[index + 1];
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = typeof nextKey === "number" ? [] : {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
}

function renderValue(input, context) {
  if (typeof input === "string") {
    const exactMatch = input.match(/^{{\\s*([^}]+)\\s*}}$/);
    if (exactMatch) {
      const resolved = getByPath(context, exactMatch[1].trim());
      return resolved === undefined ? input : resolved;
    }

    return input.replace(/{{\\s*([^}]+)\\s*}}/g, (_, expression) => {
      const resolved = getByPath(context, expression.trim());
      if (resolved === undefined || resolved === null) {
        return "";
      }
      return String(resolved);
    });
  }

  if (Array.isArray(input)) {
    return input.map((item) => renderValue(item, context));
  }

  if (input && typeof input === "object") {
    const output = {};
    Object.entries(input).forEach(([key, value]) => {
      output[key] = renderValue(value, context);
    });
    return output;
  }

  return input;
}

function createLogger(projectName, accountLabel) {
  function print(level, message) {
    console.log(\`[\${projectName}][\${accountLabel}][\${level}] \${message}\`);
  }

  return {
    info(message) {
      print("INFO", message);
    },
    success(message) {
      print("OK", message);
    },
    warn(message) {
      print("WARN", message);
    },
    error(message) {
      print("ERR", message);
    },
  };
}

function normalizeAccountLabel(account, index) {
  if (account.address) {
    return account.address;
  }

  if (account.email) {
    return account.email;
  }

  if (account.loginId) {
    return account.loginId;
  }

  return \`account-\${index + 1}\`;
}

function buildProxyAgent(proxy) {
  if (!proxy) {
    return null;
  }

  return new HttpsProxyAgent(proxy);
}

function normalizeRetryStatusCodes(input) {
  if (!Array.isArray(input)) {
    return [408, 425, 429, 500, 502, 503, 504];
  }

  const output = input
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item >= 100);
  return output.length > 0 ? output : [408, 425, 429, 500, 502, 503, 504];
}

function getRequestPolicy(spec, context) {
  const defaultPolicy = {
    maxAttempts: 2,
    baseDelayMs: 1500,
    maxDelayMs: 30000,
    retryStatusCodes: [408, 425, 429, 500, 502, 503, 504],
    respectRetryAfter: true,
  };
  const projectPolicy = (context.project && context.project.requestPolicy) || {};
  const policy = {
    ...defaultPolicy,
    ...projectPolicy,
    ...(spec.requestPolicy || {}),
  };

  policy.maxAttempts = Math.max(1, Number(policy.maxAttempts || 1));
  policy.baseDelayMs = Math.max(0, Number(policy.baseDelayMs || 0));
  policy.maxDelayMs = Math.max(policy.baseDelayMs, Number(policy.maxDelayMs || policy.baseDelayMs));
  policy.retryStatusCodes = normalizeRetryStatusCodes(policy.retryStatusCodes);
  policy.respectRetryAfter = policy.respectRetryAfter !== false;
  return policy;
}

function getRetryAfterMs(headers) {
  if (!headers || typeof headers !== "object") {
    return null;
  }

  const retryAfterRaw = headers["retry-after"] || headers["Retry-After"];
  if (!retryAfterRaw) {
    return null;
  }

  const asNumber = Number(retryAfterRaw);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return asNumber * 1000;
  }

  const asDate = Date.parse(String(retryAfterRaw));
  if (!Number.isNaN(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : 0;
  }

  return null;
}

function shouldRetryRequest(error, policy) {
  if (!error) {
    return false;
  }

  if (error.response && Number.isFinite(error.response.status)) {
    return policy.retryStatusCodes.includes(Number(error.response.status));
  }

  const retryableCodes = new Set([
    "ECONNABORTED",
    "ECONNRESET",
    "ECONNREFUSED",
    "ENOTFOUND",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "EPIPE",
  ]);
  return retryableCodes.has(error.code);
}

function computeRetryDelayMs(policy, attempt, error) {
  const exponent = Math.max(0, attempt - 1);
  const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** exponent);
  const jitter = Math.floor(Math.random() * 250);
  let delayMs = exponential + jitter;

  if (policy.respectRetryAfter && error && error.response) {
    const retryAfterMs = getRetryAfterMs(error.response.headers);
    if (retryAfterMs !== null) {
      delayMs = Math.max(delayMs, retryAfterMs);
    }
  }

  return delayMs;
}

async function sendRequest(spec, context, displayName) {
  const rendered = renderValue(spec, context);
  const proxyAgent = buildProxyAgent(context.proxy);
  const requestPolicy = getRequestPolicy(rendered, context);
  const axiosConfig = {
    method: (rendered.method || "GET").toLowerCase(),
    url: rendered.url,
    headers: rendered.headers || {},
    params: rendered.params || undefined,
    data: rendered.body || undefined,
    timeout: rendered.timeout || 30000,
  };

  if (proxyAgent) {
    axiosConfig.httpsAgent = proxyAgent;
    axiosConfig.httpAgent = proxyAgent;
    axiosConfig.proxy = false;
  }

  let attempt = 0;
  while (attempt < requestPolicy.maxAttempts) {
    attempt += 1;
    context.log.info(
      \`\${displayName}: \${axiosConfig.method.toUpperCase()} \${axiosConfig.url} (attempt \${attempt}/\${requestPolicy.maxAttempts})\`
    );

    try {
      const response = await axios(axiosConfig);
      return response.data;
    } catch (error) {
      const canRetry = attempt < requestPolicy.maxAttempts && shouldRetryRequest(error, requestPolicy);
      if (!canRetry) {
        throw error;
      }

      const waitMs = computeRetryDelayMs(requestPolicy, attempt, error);
      const status = error && error.response ? error.response.status : "network";
      context.log.warn(\`\${displayName}: status=\${status}，\${waitMs}ms 后重试\`);
      await sleep(waitMs);
    }
  }

  throw new Error(\`\${displayName}: 请求失败，达到最大尝试次数\`);
}

function loadAccounts(config) {
  const accountConfig = config.accounts || {};
  const lines = readLines(accountConfig.file);

  if (accountConfig.source === "privateKeys") {
    return lines.map((privateKey) => {
      const normalized = privateKey.startsWith("0x") ? privateKey : \`0x\${privateKey}\`;
      const wallet = new ethers.Wallet(normalized);
      return {
        privateKey: normalized,
        address: wallet.address,
      };
    });
  }

  if (accountConfig.source === "tokens") {
    return lines.map((token) => ({
      token,
    }));
  }

  const delimiter = accountConfig.delimiter || "|";
  const fields = accountConfig.fields || [];

  return lines.map((line) => {
    const parts = line.split(delimiter);
    if (fields.length > 0) {
      const normalizedLine = parts.map((part) => String(part || "").trim().toLowerCase());
      const normalizedFields = fields.map((field) => String(field || "").trim().toLowerCase());
      const isHeaderLine =
        normalizedLine.length >= normalizedFields.length &&
        normalizedFields.every((field, index) => normalizedLine[index] === field);
      if (isHeaderLine) {
        return null;
      }
    }

    const account = {};

    fields.forEach((field, index) => {
      account[field] = (parts[index] || "").trim();
    });

    return account;
  }).filter(Boolean);
}

function loadProxies(config) {
  if (!config.project || !config.project.useProxy) {
    return [];
  }

  return readLines("data/proxies.txt");
}

function readTaskRows(task) {
  const filePath = task && task.dataFile ? task.dataFile : "data/requestRows.txt";
  const lines = readLines(filePath);
  const fields =
    Array.isArray(task && task.fields) && task.fields.length > 0
      ? task.fields.map((field) => String(field || "").trim()).filter(Boolean)
      : ["value"];
  const delimiter = task && task.delimiter ? String(task.delimiter) : "|";

  return lines
    .map((line) => line.split(delimiter).map((part) => part.trim()))
    .filter((parts) => parts.some(Boolean))
    .filter((parts) => {
      const normalizedLine = parts.map((part) => String(part || "").trim().toLowerCase());
      const normalizedFields = fields.map((field) => String(field || "").trim().toLowerCase());
      const isHeaderLine =
        normalizedLine.length >= normalizedFields.length &&
        normalizedFields.every((field, index) => normalizedLine[index] === field);
      return !isHeaderLine;
    })
    .map((parts) => {
      const row = {};
      fields.forEach((field, index) => {
        row[field] = (parts[index] || "").trim();
      });
      return row;
    });
}

function getRpcUrl(config, task) {
  if (task && task.rpcUrl) {
    return task.rpcUrl;
  }

  const envKey = config.network && config.network.rpcUrlEnv;
  return envKey ? process.env[envKey] : null;
}

function getWalletContext(config, context, task) {
  if (!context.account.privateKey) {
    throw new Error("当前账号没有 privateKey，不能执行链上任务。");
  }

  if (!context.walletCache) {
    const rpcUrl = getRpcUrl(config, task);
    if (!rpcUrl) {
      throw new Error("缺少 RPC_URL，不能执行链上任务。");
    }

    const provider = new ethers.JsonRpcProvider(
      rpcUrl,
      config.network && config.network.chainId ? Number(config.network.chainId) : undefined
    );
    const wallet = new ethers.Wallet(context.account.privateKey, provider);
    context.walletCache = { provider, wallet };
  }

  return context.walletCache;
}

function buildNowContext() {
  const now = Date.now();
  return {
    iso: new Date(now).toISOString(),
    unix: Math.floor(now / 1000),
    isoPlus10m: new Date(now + 10 * 60 * 1000).toISOString(),
  };
}

async function executeAuth(config, context) {
  if (!config.auth) {
    return;
  }

  if (config.auth.type === "account_token") {
    const tokenField = config.auth.tokenField || "token";
    context.state.token = context.account[tokenField];
    if (!context.state.token) {
      throw new Error(\`账号缺少字段 \${tokenField}\`);
    }
    context.log.success("已从账号文件加载 token");
    return;
  }

  if (config.auth.type === "request") {
    const response = await sendRequest(config.auth.request, context, "auth");
    context.state.auth = response;
    context.state.token = getByPath(response, config.auth.extractTokenPath);
    applySaveToState(context.state, response, config.auth.saveToState);
    if (!context.state.token) {
      throw new Error("登录成功了，但没从响应里提取到 token。");
    }
    context.log.success("登录成功，token 已写入 state.token");
    return;
  }

  if (config.auth.type === "evm_sign") {
    const nonceResponse = await sendRequest(config.auth.nonceRequest, context, "auth_nonce");
    const nonce = config.auth.noncePath ? getByPath(nonceResponse, config.auth.noncePath) : undefined;
    const nowContext = buildNowContext();
    const messageContext = {
      ...context,
      now: nowContext,
      auth: {
        nonceResponse,
        nonce,
      },
    };

    let message = null;
    if (config.auth.messageTemplate) {
      message = renderValue(config.auth.messageTemplate, messageContext);
    }
    if (!message && config.auth.messagePath) {
      message = getByPath(nonceResponse, config.auth.messagePath);
    }
    if (!message && nonce !== undefined && nonce !== null) {
      message = String(nonce);
    }

    if (typeof message !== "string" || !message.trim()) {
      throw new Error("没有拿到待签名消息，请检查 auth.messageTemplate/messagePath/noncePath。");
    }

    const signingWallet = new ethers.Wallet(context.account.privateKey);
    const signature = await signingWallet.signMessage(message);
    const loginContext = {
      ...context,
      now: nowContext,
      auth: {
        ...(config.auth || {}),
        nonceResponse,
        nonce,
        message,
        signature,
      },
    };
    const loginResponse = await sendRequest(config.auth.loginRequest, loginContext, "auth_login");
    context.state.auth = loginResponse;
    context.state.token = getByPath(loginResponse, config.auth.extractTokenPath);
    applySaveToState(context.state, loginResponse, config.auth.saveToState);
    if (!context.state.token) {
      throw new Error("签名登录完成，但没提取到 token。");
    }
    context.log.success("签名登录成功，token 已写入 state.token");
    return;
  }

  throw new Error(\`不支持的 auth.type: \${config.auth.type}\`);
}

function applySaveToState(state, response, saveToState) {
  if (!saveToState) {
    return;
  }

  Object.entries(saveToState).forEach(([targetPath, sourcePath]) => {
    setByPath(state, targetPath, getByPath(response, sourcePath));
  });
}

async function executeRequestTask(task, context) {
  const response = await sendRequest(task, context, task.name);
  context.state.responses[task.name] = response;
  applySaveToState(context.state, response, task.saveToState);
  context.log.success(\`\${task.name} 已完成\`);
}

async function executeRequestFromFileTask(task, context) {
  const rows = readTaskRows(task);
  if (rows.length === 0) {
    context.log.warn(\`\${task.name} 没有读取到可提交的行数据\`);
    return;
  }

  const stopOnError = task.stopOnError !== false;
  let successCount = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowContext = {
      ...context,
      row,
    };

    try {
      const response = await sendRequest(task.request, rowContext, \`\${task.name}:row:\${index + 1}\`);
      context.state.responses[\`\${task.name}:row:\${index + 1}\`] = response;
      applySaveToState(context.state, response, task.saveToState);
      successCount += 1;
      context.log.success(\`\${task.name} 第 \${index + 1} 行提交完成\`);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      context.log.warn(\`\${task.name} 第 \${index + 1} 行失败: \${message}\`);
      if (stopOnError) {
        throw error;
      }
    }

    if (task.delayAfterEachMs) {
      await sleep(Number(task.delayAfterEachMs));
    }
  }

  context.log.success(\`\${task.name} 完成 \${successCount}/\${rows.length} 行\`);
}

async function executeClaimListTask(task, context) {
  const listResponse = await sendRequest(task.listRequest, context, \`\${task.name}:list\`);
  context.state.responses[\`\${task.name}:list\`] = listResponse;
  applySaveToState(context.state, listResponse, task.saveToState);

  const items = getByPath(listResponse, task.itemsPath);
  if (!Array.isArray(items) || items.length === 0) {
    context.log.warn(\`\${task.name} 没有取到可处理列表\`);
    return;
  }

  const fieldName = task.filter && task.filter.field;
  const expectedValue = task.filter ? task.filter.equals : undefined;
  const targets = items.filter((item) => {
    if (!fieldName) {
      return true;
    }
    return getByPath(item, fieldName) === expectedValue;
  });

  context.log.info(\`\${task.name} 共找到 \${targets.length} 条待处理数据\`);
  for (let index = 0; index < targets.length; index += 1) {
    const item = targets[index];
    const itemContext = {
      ...context,
      item,
    };
    const response = await sendRequest(task.claimRequest, itemContext, \`\${task.name}:claim:\${index + 1}\`);
    context.state.responses[\`\${task.name}:claim:\${index + 1}\`] = response;
    context.log.success(\`\${task.name} 第 \${index + 1} 项领取完成\`);
  }
}

async function executeWaitTask(task, context) {
  const delayMs = Number(task.delayMs || 1000);
  context.log.info(\`\${task.name} 等待 \${delayMs}ms\`);
  await sleep(delayMs);
}

function createManualAttentionError(task, detail) {
  return new Error(\`\${task.name} 需要人工确认或浏览器运行支持。原因: \${detail}\`);
}

async function executeBrowserActionTask(task, context) {
  const renderedTask = renderValue(task, context);
  context.log.warn(\`\${task.name} 需要浏览器自动化: action=\${renderedTask.action || "open"} url=\${renderedTask.url || ""}\`);
  throw createManualAttentionError(task, "当前导出项目默认不内置浏览器驱动，请优先在风的工具箱里应用内运行或手工补 Playwright。");
}

async function executeBrowserExtractTask(task, context) {
  const renderedTask = renderValue(task, context);
  context.log.warn(\`\${task.name} 需要浏览器提取上下文: \${renderedTask.url || ""}\`);
  throw createManualAttentionError(task, "浏览器提取步骤属于 URL 分析草案，建议先在应用内运行并复用浏览器会话。");
}

async function executeCaptchaSolveTask(task, context) {
  const renderedTask = renderValue(task, context);
  if (renderedTask.manualFallback !== false) {
    context.log.warn(\`\${task.name} 命中验证码，当前导出项目将停在这里等待人工处理。\`);
  }
  throw createManualAttentionError(task, "验证码步骤需要服务端接入或人工处理后再继续。");
}

async function executeWalletConnectTask(task) {
  throw createManualAttentionError(task, "钱包连接步骤默认依赖浏览器扩展会话，请在桌面端应用内运行。");
}

async function executeSolanaSignTask(task) {
  throw createManualAttentionError(task, "Solana 签名步骤需要 Phantom/Backpack 等浏览器钱包支持。");
}

async function executeSolanaTransferTask(task) {
  throw createManualAttentionError(task, "Solana 转账步骤需要单独接入 @solana/web3.js 或在工具箱里运行。");
}

async function executeContentUploadTask(task, context) {
  const renderedTask = renderValue(task, context);
  context.log.warn(\`\${task.name} 属于内容上传草案: \${renderedTask.pageUrl || ""}\`);
  throw createManualAttentionError(task, "内容上传步骤默认需要浏览器上下文或站点专用接口，建议先人工校准。");
}

function compileContract(sourceCode, contractName) {
  const input = {
    language: "Solidity",
    sources: {
      "Generated.sol": {
        content: sourceCode,
      },
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors) {
    const errors = output.errors.filter((item) => item.severity === "error");
    if (errors.length > 0) {
      throw new Error(errors.map((item) => item.formattedMessage).join("\\n"));
    }
  }

  const contract = output.contracts["Generated.sol"][contractName];
  if (!contract) {
    throw new Error(\`找不到合约名 \${contractName}\`);
  }

  return {
    abi: contract.abi,
    bytecode: \`0x\${contract.evm.bytecode.object}\`,
  };
}

async function executeDeployContractTask(config, task, context) {
  const walletContext = getWalletContext(config, context, task);
  const renderedTask = renderValue(task, context);
  const compiled = compileContract(renderedTask.sourceCode, renderedTask.contractName);
  const factory = new ethers.ContractFactory(compiled.abi, compiled.bytecode, walletContext.wallet);
  const overrides = {};

  if (renderedTask.gasLimit) {
    overrides.gasLimit = BigInt(renderedTask.gasLimit);
  }

  context.log.info(\`\${task.name} 正在部署 \${renderedTask.contractName}\`);
  const contract = await factory.deploy(...(renderedTask.constructorArgs || []), overrides);
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  context.state.responses[task.name] = {
    address: contractAddress,
  };
  context.log.success(\`\${task.name} 部署成功: \${contractAddress}\`);
}

async function executeContractWriteTask(config, task, context) {
  const walletContext = getWalletContext(config, context, task);
  const renderedTask = renderValue(task, context);
  const contract = new ethers.Contract(renderedTask.contractAddress, renderedTask.abi, walletContext.wallet);
  const overrides = {};

  if (renderedTask.gasLimit) {
    overrides.gasLimit = BigInt(renderedTask.gasLimit);
  }

  if (renderedTask.value) {
    if (renderedTask.valueUnit === "wei") {
      overrides.value = BigInt(renderedTask.value);
    } else {
      overrides.value = ethers.parseEther(String(renderedTask.value));
    }
  }

  context.log.info(\`\${task.name} 正在调用 \${renderedTask.method}\`);
  const tx = await contract[renderedTask.method](...(renderedTask.args || []), overrides);
  const receipt = await tx.wait();
  context.state.responses[task.name] = {
    hash: tx.hash,
    status: receipt.status,
  };
  context.log.success(\`\${task.name} 交易已确认: \${tx.hash}\`);
}

async function executeNativeTransferTask(config, task, context) {
  const walletContext = getWalletContext(config, context, task);
  const renderedTask = renderValue(task, context);
  const txRequest = {
    to: renderedTask.to,
    value:
      renderedTask.amountUnit === "wei"
        ? BigInt(renderedTask.amount)
        : ethers.parseEther(String(renderedTask.amount)),
  };

  if (renderedTask.gasLimit) {
    txRequest.gasLimit = BigInt(renderedTask.gasLimit);
  }

  context.log.info(\`\${task.name} 正在发送原生币到 \${txRequest.to}\`);
  const tx = await walletContext.wallet.sendTransaction(txRequest);
  const receipt = await tx.wait();
  context.state.responses[task.name] = {
    hash: tx.hash,
    status: receipt.status,
  };
  context.log.success(\`\${task.name} 转账成功: \${tx.hash}\`);
}

async function executeTask(config, task, context) {
  const notes = Array.isArray(task.notes) ? task.notes : [];
  notes.forEach((note) => {
    context.log.info(\`\${task.name} 说明: \${note}\`);
  });

  if (task.type === "request") {
    await executeRequestTask(task, context);
    return;
  }

  if (task.type === "requestFromFile") {
    await executeRequestFromFileTask(task, context);
    return;
  }

  if (task.type === "claimList") {
    await executeClaimListTask(task, context);
    return;
  }

  if (task.type === "wait") {
    await executeWaitTask(task, context);
    return;
  }

  if (task.type === "contractWrite") {
    await executeContractWriteTask(config, task, context);
    return;
  }

  if (task.type === "deployContract") {
    await executeDeployContractTask(config, task, context);
    return;
  }

  if (task.type === "nativeTransfer") {
    await executeNativeTransferTask(config, task, context);
    return;
  }

  if (task.type === "browserAction") {
    await executeBrowserActionTask(task, context);
    return;
  }

  if (task.type === "browserExtract") {
    await executeBrowserExtractTask(task, context);
    return;
  }

  if (task.type === "captchaSolve") {
    await executeCaptchaSolveTask(task, context);
    return;
  }

  if (task.type === "walletConnect") {
    await executeWalletConnectTask(task, context);
    return;
  }

  if (task.type === "solanaSign") {
    await executeSolanaSignTask(task, context);
    return;
  }

  if (task.type === "solanaTransfer") {
    await executeSolanaTransferTask(task, context);
    return;
  }

  if (task.type === "contentUpload") {
    await executeContentUploadTask(task, context);
    return;
  }

  throw new Error(\`不支持的任务类型: \${task.type}\`);
}

async function runForAccount(config, account, index, proxies) {
  const proxy =
    config.project && config.project.useProxy ? proxies[index % proxies.length] || null : null;
  const accountLabel = normalizeAccountLabel(account, index);
  const context = {
    account,
    env: process.env,
    proxy,
    state: {
      responses: {},
    },
    project: config.project || {},
    log: createLogger((config.project && config.project.name) || "generated-bot", accountLabel),
    walletCache: null,
  };

  try {
    await executeAuth(config, context);

    for (const task of config.tasks || []) {
      await executeTask(config, task, context);
      if (task.delayAfterMs) {
        await sleep(Number(task.delayAfterMs));
      }
    }

    context.log.success("全部任务执行完成");
    return { success: true };
  } catch (error) {
    context.log.error(error.message || String(error));
    return { success: false, error: error.message || String(error) };
  }
}

async function runOnce(config) {
  const accounts = loadAccounts(config);
  if (accounts.length === 0) {
    throw new Error("没有加载到账号数据，请检查 data/ 文件。");
  }

  const proxies = loadProxies(config);
  const concurrency = Math.max(1, Number((config.project && config.project.concurrency) || 1));
  const results = [];

  for (let index = 0; index < accounts.length; index += concurrency) {
    const batch = accounts.slice(index, index + concurrency);
    const settled = await Promise.all(
      batch.map((account, batchIndex) =>
        runForAccount(config, account, index + batchIndex, proxies)
      )
    );
    results.push(...settled);
  }

  const successCount = results.filter((item) => item.success).length;
  console.log(\`[SUMMARY] 成功 \${successCount}/\${results.length}\`);
}

async function runProject(config) {
  do {
    await runOnce(config);

    if (!config.project || !config.project.repeat) {
      break;
    }

    const intervalMinutes = Number(config.project.intervalMinutes || 60);
    console.log(\`[LOOP] 等待 \${intervalMinutes} 分钟后再次执行\\n\`);
    await sleep(intervalMinutes * 60 * 1000);
  } while (true);
}

module.exports = {
  runProject,
};
`;
}

function buildReadme(projectConfig, selectedPresets) {
  const taskLikeItems =
    selectedPresets && selectedPresets.length > 0
      ? selectedPresets.map((preset) => ({
          label: preset.label,
          summary: preset.summary,
        }))
      : (projectConfig.tasks || []).map((task) => ({
          label: task.name,
          summary: task.type,
        }));

  const presetLines = taskLikeItems
    .map((item, index) => `${index + 1}. ${item.label}: ${item.summary}`)
    .join("\n");

  const accountGuide =
    projectConfig.accounts.source === "privateKeys"
      ? "- `data/privateKeys.txt`: 每行一个 EVM 私钥。\n"
      : projectConfig.accounts.source === "tokens"
      ? "- `data/tokens.txt`: 每行一个 Bearer Token。\n"
      : `- \`${projectConfig.accounts.file}\`: 每行一组账号，按 \`${projectConfig.accounts.fields.join("|")}\` 的顺序填写。\n`;
  const taskDataGuides = buildTaskDataGuides(projectConfig);
  const taskDataGuideText =
    taskDataGuides.length > 0 ? `${taskDataGuides.join("\n")}\n` : "";

  return `# ${projectConfig.project.name}

这是由 \`风的工具箱\` 自动生成的测试网脚本模板。

零基础先看：
- \`00-先看这里-零基础说明.md\`
- \`0-双击-运行前检查.bat\`
- \`1-双击-安装依赖.bat\`
- \`2-双击-启动脚本.bat\`

## 已拼接的任务积木
${presetLines}

## 使用步骤
1. 先双击 \`0-双击-运行前检查.bat\`，看还缺什么
2. 首次运行，双击 \`1-双击-安装依赖.bat\`
3. 打开 \`.env\`，填写需要的环境变量
4. 填写账号文件和代理文件
5. 必要时编辑 \`project.config.json\`，把示例 URL、合约地址、ABI、方法名、字段路径改成真实值
6. 双击 \`2-双击-启动脚本.bat\`，它会自动先做自检再启动

如果你懒得分步骤：
- 直接双击 \`2-双击-启动脚本.bat\` 也可以，它会自动补装依赖并先做自检。

## 运行建议
${buildRuntimeSupportGuide(projectConfig).join("\n")}

## 你最需要改的文件
- \`project.config.json\`: 核心配置，任务拼接就在这里
- \`runtime.config.json\`: 应用内运行、浏览器会话和验证码策略
- \`artifacts/source-material.json\`: 来源材料、分析摘要和适配器判断
- \`project.requestPolicy\`: 全局请求重试策略（429/5xx/网络抖动）
- \`.env\`: 已自动生成，直接填 RPC、验证码 token 等敏感参数
${accountGuide}- \`data/proxies.txt\`: 如果开了代理，每行一个代理
${taskDataGuideText}
- \`doctor.js\`: 运行前自检脚本，双击 bat 时会自动调用
- \`运行前检查报告.txt\`: 自检结果会写到这里
- \`logs/last-error.txt\`: 最近一次运行失败的详细报错

## 模板变量
- \`{{account.address}}\`: 当前钱包地址
- \`{{account.email}}\`: 当前账号的 email 字段
- \`{{state.token}}\`: 登录后保存到 state 的 token
- \`{{item.id}}\`: 领取列表任务时当前项目的 id
- \`{{row.taskId}}\` / \`{{row.answer}}\`: 从行数据文件里读出来的字段
- \`{{env.CAPTCHA_TOKEN}}\`: 从 \`.env\` 读取的环境变量
- 路径表达式支持数组下标，例如 \`data.items[0].id\`

## 现实约束
- 这个生成器能帮你把脚本骨架和任务顺序搭好，但不能凭空知道项目方私有接口。
- 真正要跑通，仍然需要你从浏览器 Network 面板或链上浏览器里补齐 URL、请求体、ABI、方法名、字段路径。
- 如果项目是 Solana 签名登录、复杂验证码、前端加密参数，这个模板需要二次扩展。
`;
}

function buildSourceMaterialFile(projectConfig, sourceArtifacts) {
  return `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceMaterial: projectConfig.meta && projectConfig.meta.workflowSourceMaterial
        ? projectConfig.meta.workflowSourceMaterial
        : null,
      runtime: projectConfig.runtime || {},
      exportedArtifacts: sourceArtifacts && Array.isArray(sourceArtifacts.files) ? sourceArtifacts.files : [],
    },
    null,
    2
  )}\n`;
}

function createProject(options) {
  const projectConfig = buildProjectConfig(options);
  const files = [];
  const outputDir = path.resolve(options.outputDir);
  const envExample = buildEnvExample(projectConfig);

  const projectFiles = {
    "package.json": buildGeneratedPackageJson(options.projectName),
    ".env.example": envExample,
    ".env": envExample,
    "00-先看这里-零基础说明.md": buildStarterGuide(projectConfig),
    "0-双击-运行前检查.bat": buildCheckHelperScript(),
    "1-双击-安装依赖.bat": buildInstallHelperScript(),
    "2-双击-启动脚本.bat": buildStartHelperScript(),
    "doctor.js": buildDoctorSource(),
    "project.config.json": `${JSON.stringify(projectConfig, null, 2)}\n`,
    "runtime.config.json": `${JSON.stringify(projectConfig.runtime || {}, null, 2)}\n`,
    "artifacts/source-material.json": buildSourceMaterialFile(projectConfig, options.sourceArtifacts),
    "main.js": buildMainSource(),
    "lib/runner.js": buildRunnerSource(),
    "README.md": buildReadme(projectConfig, options.selectedPresets),
  };

  Object.entries({
    ...projectFiles,
    ...buildDataFileContent(projectConfig, options),
    ...(options.extraFiles || {}),
  }).forEach(([relativePath, content]) => {
    const fullPath = path.join(outputDir, relativePath);
    writeFile(fullPath, content);
    files.push(fullPath);
  });

  return {
    outputDir,
    files,
  };
}

module.exports = {
  buildProjectConfig,
  createProject,
};
