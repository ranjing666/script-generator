const fs = require("fs");
const path = require("path");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
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
    },
    accounts: buildAccountsConfig(options),
    network: requiresRpc
      ? {
          rpcUrlEnv: "RPC_URL",
          chainId: 11155111,
        }
      : null,
    auth: options.auth,
    tasks,
  };
}

function buildEnvExample(projectConfig) {
  const lines = [
    "# 复制为 .env 后再填写",
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

  if (lines.length === 1) {
    lines.push("# 当前模板没有强制依赖的环境变量");
  }

  return `${lines.join("\n")}\n`;
}

function buildDataFileContent({ accountSource, accountFields, useProxy }) {
  const files = {};

  if (accountSource === "privateKeys") {
    files["data/privateKeys.txt"] = "0x你的私钥1\n0x你的私钥2\n";
  } else if (accountSource === "tokens") {
    files["data/tokens.txt"] = "your_bearer_token_1\nyour_bearer_token_2\n";
  } else {
    files["data/accounts.txt"] = `${accountFields.join("|")}\n`;
  }

  files["data/proxies.txt"] = useProxy
    ? "http://user:pass@127.0.0.1:8080\n"
    : "";

  return files;
}

function buildGeneratedPackageJson(projectName) {
  return JSON.stringify(
    {
      name: projectName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
      version: "1.0.0",
      private: true,
      main: "main.js",
      scripts: {
        start: "node main.js",
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
  return `const config = require("./project.config.json");
const { runProject } = require("./lib/runner");

runProject(config).catch((error) => {
  console.error("运行失败:", error);
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
    .filter(Boolean);
}

function getByPath(input, expression) {
  if (!expression) {
    return input;
  }

  return expression.split(".").reduce((current, key) => {
    if (current === null || current === undefined) {
      return undefined;
    }

    return current[key];
  }, input);
}

function setByPath(target, expression, value) {
  const keys = expression.split(".");
  let current = target;

  while (keys.length > 1) {
    const key = keys.shift();
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[0]] = value;
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

async function sendRequest(spec, context, displayName) {
  const rendered = renderValue(spec, context);
  const proxyAgent = buildProxyAgent(context.proxy);
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

  context.log.info(\`\${displayName}: \${axiosConfig.method.toUpperCase()} \${axiosConfig.url}\`);
  const response = await axios(axiosConfig);
  return response.data;
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
    const account = {};

    fields.forEach((field, index) => {
      account[field] = (parts[index] || "").trim();
    });

    return account;
  });
}

function loadProxies(config) {
  if (!config.project || !config.project.useProxy) {
    return [];
  }

  return readLines("data/proxies.txt");
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
    const message = config.auth.messagePath
      ? getByPath(nonceResponse, config.auth.messagePath)
      : renderValue(config.auth.messageTemplate, {
          ...context,
          auth: {
            nonceResponse,
          },
        });

    if (!message) {
      throw new Error("没有拿到待签名消息，请检查 auth.messagePath。");
    }

    const signingWallet = new ethers.Wallet(context.account.privateKey);
    const signature = await signingWallet.signMessage(message);
    const loginContext = {
      ...context,
      auth: {
        nonceResponse,
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

  return `# ${projectConfig.project.name}

这是由 \`script-generator\` 自动生成的测试网脚本模板。

## 已拼接的任务积木
${presetLines}

## 使用步骤
1. 运行 \`npm install\`
2. 复制 \`.env.example\` 为 \`.env\`
3. 编辑 \`project.config.json\`，把示例 URL、合约地址、ABI、字段路径改成真实值
4. 填写账号文件和代理文件
5. 运行 \`npm start\`

## 你最需要改的文件
- \`project.config.json\`: 核心配置，任务拼接就在这里
- \`.env\`: RPC、验证码 token 等敏感参数
${accountGuide}- \`data/proxies.txt\`: 如果开了代理，每行一个代理

## 模板变量
- \`{{account.address}}\`: 当前钱包地址
- \`{{account.email}}\`: 当前账号的 email 字段
- \`{{state.token}}\`: 登录后保存到 state 的 token
- \`{{item.id}}\`: 领取列表任务时当前项目的 id
- \`{{env.CAPTCHA_TOKEN}}\`: 从 \`.env\` 读取的环境变量

## 现实约束
- 这个生成器能帮你把脚本骨架和任务顺序搭好，但不能凭空知道项目方私有接口。
- 真正要跑通，仍然需要你从浏览器 Network 面板或链上浏览器里补齐 URL、请求体、ABI、方法名、字段路径。
- 如果项目是 Solana 签名登录、复杂验证码、前端加密参数，这个模板需要二次扩展。
`;
}

function createProject(options) {
  const projectConfig = buildProjectConfig(options);
  const files = [];
  const outputDir = path.resolve(options.outputDir);

  const projectFiles = {
    "package.json": buildGeneratedPackageJson(options.projectName),
    ".env.example": buildEnvExample(projectConfig),
    "project.config.json": `${JSON.stringify(projectConfig, null, 2)}\n`,
    "main.js": buildMainSource(),
    "lib/runner.js": buildRunnerSource(),
    "README.md": buildReadme(projectConfig, options.selectedPresets),
  };

  Object.entries({
    ...projectFiles,
    ...buildDataFileContent(options),
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
  createProject,
};
