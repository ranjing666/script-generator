const path = require("path");
const readline = require("readline");
const { getAvailablePresets, buildAuthConfig } = require("./lib/presets");
const { createProject } = require("./lib/generator");
const {
  loadImportCandidates,
  inferAccountSource,
  inferAccountFields,
  inferAuthStrategy,
  buildImportedAuth,
  buildImportedTaskGroups,
  finalizeImportedPlan,
} = require("./lib/importer");

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, label, defaultValue = "") {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  return new Promise((resolve) => {
    rl.question(`${label}${suffix}: `, (answer) => {
      const value = answer.trim();
      resolve(value || defaultValue);
    });
  });
}

async function chooseOne(rl, title, options, defaultIndex = 0) {
  console.log(`\n${title}`);
  options.forEach((option, index) => {
    console.log(`${index + 1}. ${option.label}`);
    if (option.description) {
      console.log(`   ${option.description}`);
    }
  });

  const answer = await ask(rl, "输入编号", String(defaultIndex + 1));
  const selected = Number.parseInt(answer, 10) - 1;
  return options[selected] || options[defaultIndex];
}

async function chooseMany(rl, title, options, defaultValues) {
  console.log(`\n${title}`);
  options.forEach((option, index) => {
    console.log(`${index + 1}. ${option.label}`);
    if (option.summary) {
      console.log(`   ${option.summary}`);
    }
  });

  const answer = await ask(rl, "输入多个编号，用逗号分隔", defaultValues);
  const selectedIndexes = answer
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10) - 1)
    .filter((item) => Number.isInteger(item) && item >= 0 && item < options.length);

  const uniqueIndexes = [...new Set(selectedIndexes)];
  return uniqueIndexes.length > 0 ? uniqueIndexes.map((index) => options[index]) : [];
}

async function askYesNo(rl, label, defaultValue = false) {
  const normalizedDefault = defaultValue ? "y" : "n";
  const answer = await ask(rl, `${label} (y/n)`, normalizedDefault);
  return answer.toLowerCase().startsWith("y");
}

function toSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function summarizeImportedCandidate(candidate) {
  return `${candidate.kind} | ${candidate.summary}`;
}

function summarizeImportedGroup(group) {
  const kinds = group.sourceKinds.join(" + ");
  return `推荐顺序 ${group.recommendedOrder} | ${kinds} | ${group.summary}`;
}

function buildImportReport({
  importSource,
  inputPath,
  inferredAccountSource,
  inferredAuthMode,
  accountSource,
  authMode,
  authConfig,
  selectedTaskGroups,
  allCandidates,
}) {
  const candidateMap = new Map(allCandidates.map((candidate) => [candidate.id, candidate]));
  const selectedCandidateIds = new Set(
    selectedTaskGroups.flatMap((group) => group.sourceCandidateIds || [])
  );
  const warnings = [];

  if (authMode === "evm_sign") {
    if (!authConfig || authConfig.type !== "evm_sign") {
      warnings.push("签名登录模式已启用，但未生成 evm_sign 配置。");
    } else {
      if (!authConfig.noncePath) {
        warnings.push("未识别到 noncePath，建议手动检查 nonce/challenge 响应字段。");
      }
      if (!authConfig.messageTemplate && !authConfig.messagePath) {
        warnings.push("未识别到 messageTemplate/messagePath，签名消息可能无法自动构造。");
      }
      if (authConfig.messagePath === "data.message" && !authConfig.messageTemplate) {
        warnings.push("messagePath 仍是默认值 data.message，建议手动确认。");
      }
      if (authConfig.siwe) {
        if (!authConfig.siwe.domain || !authConfig.siwe.uri || !authConfig.siwe.chainId) {
          warnings.push("SIWE 上下文字段不完整（domain/uri/chainId），建议手动补齐。");
        }
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    importSource,
    importInputPath: path.resolve(inputPath),
    inferred: {
      accountSource: inferredAccountSource,
      authMode: inferredAuthMode,
    },
    selected: {
      accountSource,
      authMode,
      groupCount: selectedTaskGroups.length,
      groups: selectedTaskGroups.map((group) => ({
        id: group.id,
        label: group.label,
        summary: group.summary,
        recommendedOrder: group.recommendedOrder,
        sourceKinds: group.sourceKinds,
        sourceCandidateIds: group.sourceCandidateIds,
        taskType: group.task.type,
        taskName: group.task.name,
      })),
    },
    authSummary: authConfig
      ? {
          type: authConfig.type || authMode,
          hasNoncePath: Boolean(authConfig.noncePath),
          hasMessagePath: Boolean(authConfig.messagePath),
          hasMessageTemplate: Boolean(authConfig.messageTemplate),
          siwe: authConfig.siwe || null,
        }
      : null,
    warnings,
    candidates: [...selectedCandidateIds].map((candidateId) => {
      const candidate = candidateMap.get(candidateId);
      if (!candidate) {
        return { id: candidateId, missing: true };
      }

      return {
        id: candidate.id,
        sourceType: candidate.sourceType,
        kind: candidate.kind,
        name: candidate.name,
        summary: candidate.summary,
        method: candidate.method,
        url: candidate.url,
      };
    }),
  };
}

async function runWizard(rl) {
  const projectName = await ask(rl, "项目名", "my-testnet-bot");

  const accountSource = await chooseOne(
    rl,
    "选择账号来源",
    [
      {
        id: "privateKeys",
        label: "私钥文件 `data/privateKeys.txt`",
        description: "适合链上测试网任务，自动推导钱包地址。",
      },
      {
        id: "tokens",
        label: "Token 文件 `data/tokens.txt`",
        description: "适合已经能手动拿到 Bearer Token 的网站任务。",
      },
      {
        id: "accounts",
        label: "自定义账号文件 `data/accounts.txt`",
        description: "适合邮箱密码、loginId/passcode 这类账号密码站点。",
      },
    ],
    0
  );

  let accountFields = [];
  if (accountSource.id === "accounts") {
    const fieldsInput = await ask(rl, "账号字段名，逗号分隔", "email,password");
    accountFields = fieldsInput
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const useProxy = await askYesNo(rl, "是否启用代理文件 `data/proxies.txt`", false);
  const repeat = await askYesNo(rl, "是否循环执行", false);
  const intervalMinutes = repeat
    ? Number.parseInt(await ask(rl, "循环间隔分钟", "60"), 10) || 60
    : 0;
  const concurrency = Number.parseInt(await ask(rl, "并发账号数", "3"), 10) || 3;

  let authMode = { id: "none", label: "不预置登录" };
  if (accountSource.id === "tokens") {
    authMode = { id: "account_token", label: "直接使用 token 文件" };
  } else {
    const authChoices = [
      {
        id: "none",
        label: "不预置登录",
        description: "适合纯链上任务，或者你准备后面手动补登录流程。",
      },
      {
        id: "request",
        label: "普通请求登录",
        description: "适合邮箱密码、验证码后拿 token 的站点。",
      },
    ];

    if (accountSource.id === "privateKeys") {
      authChoices.push({
        id: "evm_sign",
        label: "EVM 签名登录",
        description: "适合先拿 nonce，再签名，再换 token 的网站。",
      });
    }

    authMode = await chooseOne(rl, "选择登录骨架", authChoices, 0);
  }

  const presets = getAvailablePresets({ accountSource: accountSource.id });
  const defaultPresetIndexes = accountSource.id === "privateKeys" ? "1,5,6" : "1,2,4";
  const selectedPresets = await chooseMany(
    rl,
    "选择要拼接的任务积木",
    presets,
    defaultPresetIndexes
  );

  if (selectedPresets.length === 0) {
    throw new Error("至少选择一个任务积木。");
  }

  const slug = toSlug(projectName) || "my-testnet-bot";
  const defaultOutputDir = path.join(process.cwd(), "generated", slug);
  const outputDir = await ask(rl, "输出目录", defaultOutputDir);

  const auth = buildAuthConfig({
    authMode: authMode.id,
    accountSource: accountSource.id,
    accountFields,
  });

  return createProject({
    projectName,
    outputDir,
    accountSource: accountSource.id,
    accountFields,
    useProxy,
    repeat,
    intervalMinutes,
    concurrency,
    auth,
    authMode: authMode.id,
    selectedPresets,
  });
}

async function runImportWizard(rl) {
  const projectName = await ask(rl, "项目名", "imported-testnet-bot");
  const importSource = await chooseOne(
    rl,
    "选择抓包来源",
    [
      {
        id: "har",
        label: "HAR 文件",
        description: "浏览器 Network 导出的完整 HAR，更适合自动识别 token 路径。",
      },
      {
        id: "postman",
        label: "Postman Collection v2.1",
        description: "支持导入 Postman 的 collection JSON，并自动解析请求示例。",
      },
      {
        id: "curl",
        label: "cURL 文本文件",
        description: "把浏览器复制出来的 cURL 命令保存成 txt 文件再导入。",
      },
    ],
    0
  );

  const inputPath = await ask(rl, "输入 HAR/Collection/txt 文件路径");
  const candidates = loadImportCandidates(importSource.id, inputPath);
  if (candidates.length === 0) {
    throw new Error("没有从抓包文件中解析出可导入请求。");
  }

  console.log("\n已识别请求候选项：");
  candidates.forEach((candidate, index) => {
    console.log(`${index + 1}. ${candidate.name}`);
    console.log(`   ${summarizeImportedCandidate(candidate)}`);
  });

  const inferredAccountSource = inferAccountSource(candidates);
  const accountSource = await chooseOne(
    rl,
    "选择账号来源",
    [
      {
        id: "privateKeys",
        label: "私钥文件 `data/privateKeys.txt`",
        description:
          inferredAccountSource === "privateKeys" ? "推荐：导入内容里像钱包签名流程。" : "适合钱包地址、签名登录、链上账号。",
      },
      {
        id: "tokens",
        label: "Token 文件 `data/tokens.txt`",
        description:
          inferredAccountSource === "tokens" ? "推荐：抓包里已有 Bearer Token。" : "适合你已经拿到 token，只想复用后续请求。",
      },
      {
        id: "accounts",
        label: "自定义账号文件 `data/accounts.txt`",
        description:
          inferredAccountSource === "accounts" ? "推荐：抓包里像账号密码登录。" : "适合 email/password、loginId/passcode 之类账号。",
      },
    ],
    ["privateKeys", "tokens", "accounts"].indexOf(inferredAccountSource)
  );

  let accountFields = [];
  if (accountSource.id === "accounts") {
    const guessedFields = inferAccountFields(
      candidates.find((candidate) => candidate.kind === "auth_login")
    );
    const fieldsInput = await ask(rl, "账号字段名，逗号分隔", guessedFields.join(","));
    accountFields = fieldsInput
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const inferredAuthMode = inferAuthStrategy(candidates, accountSource.id);
  const authOptions = [
    {
      id: "none",
      label: "不导入登录",
      description: "只导入任务请求，登录你后面自己改。",
    },
    {
      id: "account_token",
      label: "使用 token 文件",
      description: "适合抓包里只有已登录请求。",
    },
  ];

  if (accountSource.id === "accounts") {
    authOptions.push({
      id: "request",
      label: "导入账号密码登录请求",
      description: "适合普通表单登录接口。",
    });
  }

  if (accountSource.id === "privateKeys") {
    authOptions.push({
      id: "evm_sign",
      label: "导入钱包签名登录流程",
      description: "适合 nonce -> sign -> login。",
    });
  }

  const authMode = await chooseOne(
    rl,
    "选择登录导入模式",
    authOptions,
    Math.max(0, authOptions.findIndex((item) => item.id === inferredAuthMode))
  );

  const authCandidates = candidates.filter((candidate) =>
    ["auth_nonce", "auth_login"].includes(candidate.kind)
  );
  let nonceCandidate = null;
  let loginCandidate = null;

  if (authMode.id === "request") {
    const loginOptions = authCandidates
      .filter((candidate) => candidate.kind === "auth_login")
      .map((candidate) => ({
        candidate,
        label: candidate.name,
        description: summarizeImportedCandidate(candidate),
      }));
    if (loginOptions.length === 0) {
      throw new Error("未找到可用的登录请求，请改用“不导入登录”或检查抓包内容。");
    }

    const selected = await chooseOne(
      rl,
      "选择登录请求",
      loginOptions,
      0
    );
    loginCandidate = selected.candidate;
  }

  if (authMode.id === "evm_sign") {
    const nonceOptions = authCandidates
      .filter((candidate) => candidate.kind === "auth_nonce")
      .map((candidate) => ({
        candidate,
        label: candidate.name,
        description: summarizeImportedCandidate(candidate),
      }));
    const loginOptions = authCandidates
      .filter((candidate) => candidate.kind === "auth_login")
      .map((candidate) => ({
        candidate,
        label: candidate.name,
        description: summarizeImportedCandidate(candidate),
      }));
    if (nonceOptions.length === 0) {
      throw new Error("未找到 nonce/challenge 请求，无法自动生成签名登录链路。");
    }
    if (loginOptions.length === 0) {
      throw new Error("未找到签名登录请求，无法自动生成签名登录链路。");
    }

    const nonceSelected = await chooseOne(
      rl,
      "选择 nonce 请求",
      nonceOptions,
      0
    );
    const loginSelected = await chooseOne(
      rl,
      "选择登录请求",
      loginOptions,
      0
    );
    nonceCandidate = nonceSelected.candidate;
    loginCandidate = loginSelected.candidate;
  }

  const taskGroups = buildImportedTaskGroups({
    candidates,
    authMode: authMode.id,
    loginCandidate,
    nonceCandidate,
    accountSource: accountSource.id,
    accountFields,
  });

  if (taskGroups.length === 0) {
    throw new Error("没有从抓包里构造出可导入任务组。");
  }

  console.log("\n推荐任务组：");
  taskGroups.forEach((group, index) => {
    console.log(`${index + 1}. ${group.label}`);
    console.log(`   ${summarizeImportedGroup(group)}`);
  });

  const defaultTaskIndexes = taskGroups.map((_, index) => String(index + 1)).join(",");
  const selectedTaskGroups = await chooseMany(
    rl,
    "选择要导入的任务组",
    taskGroups.map((group) => ({
      ...group,
      label: group.label,
      summary: summarizeImportedGroup(group),
    })),
    defaultTaskIndexes
  );

  if (selectedTaskGroups.length === 0) {
    throw new Error("至少选择一个任务组。");
  }

  const useProxy = await askYesNo(rl, "是否启用代理文件 `data/proxies.txt`", false);
  const repeat = await askYesNo(rl, "是否循环执行", false);
  const intervalMinutes = repeat
    ? Number.parseInt(await ask(rl, "循环间隔分钟", "60"), 10) || 60
    : 0;
  const concurrency = Number.parseInt(await ask(rl, "并发账号数", "3"), 10) || 3;

  const slug = toSlug(projectName) || "imported-testnet-bot";
  const defaultOutputDir = path.join(process.cwd(), "generated", slug);
  const outputDir = await ask(rl, "输出目录", defaultOutputDir);

  const auth = buildImportedAuth({
    authMode: authMode.id,
    loginCandidate,
    nonceCandidate,
    accountSource: accountSource.id,
    accountFields,
  });

  const finalizedPlan = finalizeImportedPlan({
    auth,
    taskGroups: selectedTaskGroups,
    loginCandidate,
    candidates,
  });

  const customTasks = finalizedPlan.taskGroups.map((group) => group.task);
  const recommendedTaskOrder = finalizedPlan.taskGroups.map((group) => ({
    order: group.recommendedOrder,
    label: group.label,
    sourceKinds: group.sourceKinds,
  }));

  const importReport = buildImportReport({
    importSource: importSource.id,
    inputPath,
    inferredAccountSource,
    inferredAuthMode,
    accountSource: accountSource.id,
    authMode: authMode.id,
    authConfig: finalizedPlan.auth,
    selectedTaskGroups: finalizedPlan.taskGroups,
    allCandidates: candidates,
  });

  return createProject({
    projectName,
    outputDir,
    accountSource: accountSource.id,
    accountFields,
    useProxy,
    repeat,
    intervalMinutes,
    concurrency,
    auth: finalizedPlan.auth,
    authMode: authMode.id,
    selectedPresets: [],
    customTasks,
    meta: {
      importSource: importSource.id,
      importedRequestCount: selectedTaskGroups.reduce(
        (total, group) => total + group.sourceCandidateIds.length,
        0
      ),
      importedGroupCount: selectedTaskGroups.length,
      importedAuthMode: authMode.id,
      recommendedTaskOrder,
    },
    extraFiles: {
      "import.report.json": `${JSON.stringify(importReport, null, 2)}\n`,
    },
  });
}

async function main() {
  const rl = createInterface();

  try {
    console.log("测试网脚本生成器");
    console.log("目标：用任务积木或抓包结果拼出一个可运行的 Node.js 自动化脚本。\n");

    const mode = await chooseOne(
      rl,
      "选择工作模式",
      [
        {
          id: "wizard",
          label: "手动拼接模式",
          description: "自己选账号来源、登录骨架和任务积木。",
        },
        {
          id: "import",
          label: "抓包导入模式",
          description: "从 HAR 或 cURL 自动生成 project.config.json。",
        },
      ],
      0
    );

    const result = mode.id === "import" ? await runImportWizard(rl) : await runWizard(rl);

    console.log("\n已生成：");
    result.files.forEach((file) => {
      console.log(`- ${file}`);
    });

    console.log("\n下一步：");
    console.log(`1. 进入目录: ${result.outputDir}`);
    console.log("2. 运行: npm install");
    console.log("3. 编辑: project.config.json、.env、data/ 下的文件");
    console.log("4. 启动: npm start");
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`生成失败: ${error.message}`);
  process.exit(1);
});
